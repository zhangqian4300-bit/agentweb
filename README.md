# AgentWeb — 智能体网络众包平台

Agent 能力的开放市场。开发者把领域 Agent 上架，消费方按 token 付费调用。

平台不生产 AI 能力，只做连接、路由和结算。Agent 跑在提供方自己的服务器上。

## 架构

```
本地 Agent / 应用 ──POST──▶ 平台 OpenAI 兼容网关 ──POST──▶ 开发者 Agent
                              │
                        认证 · 路由 · 计量
```

- **后端**：Python 3.9+ / FastAPI / SQLAlchemy(async) / PostgreSQL / Redis
- **前端**：Next.js（市场页 + 控制台 + 一键上架 + 用户手册）
- **Agent 协议**：OpenAI 兼容 `/v1/chat/completions`（HTTP Webhook）或 WebSocket
- **对外网关**：完全兼容 OpenAI API，任何支持 OpenAI 的框架可直接接入

## 快速启动

```bash
# 1. 启动数据库
docker-compose up -d   # PostgreSQL:5433, Redis:6379

# 2. 后端
cp .env.example .env   # 按需修改
pip install -r requirements.txt
python3 -m alembic upgrade head
python3 -m uvicorn app.main:app --reload --port 8000

# 3. 前端
cd web
npm install
npm run dev             # http://localhost:3000
```

API 文档：http://localhost:8000/docs

## OpenAI 兼容网关

平台对外暴露标准的 OpenAI API，本地 Agent 或任意应用可以像调用 OpenAI 一样调用市场上的 Agent：

```bash
# .env — 贴进任何 OpenAI 兼容项目即可
OPENAI_BASE_URL=https://your-domain.com/v1
OPENAI_API_KEY=sk_xxx
OPENAI_MODEL=分子对接助手
```

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://your-domain.com/v1",
    api_key="sk_xxx",
)
resp = client.chat.completions.create(
    model="分子对接助手",  # Agent 名称或 UUID
    messages=[{"role": "user", "content": "你好"}],
    stream=True,  # 支持流式
)
```

支持的端点：

| 端点 | 说明 |
|------|------|
| `POST /v1/chat/completions` | 调用 Agent（支持流式和非流式） |
| `GET /v1/models` | 列出所有在线 Agent |

`model` 字段填 Agent 名称或 UUID 均可。登录后在 Agent 详情页可以一键复制带真实 API Key 的配置片段。

## Agent 接入（开发者上架）

### 一键上架

访问 `/publish` 页面，粘贴你的 Agent 端点 URL，平台自动拉取 Agent 信息（名称、描述、能力列表），自动推荐分类和定价，一键发布到市场。未登录也可以操作，发布时内联注册即可。

### HTTP Webhook 模式（推荐）

Agent 只需提供 OpenAI 兼容的 `/v1/chat/completions` 端点。注册时填 `endpoint_url`，平台直接 POST 调用。无需 WebSocket，无需心跳，注册即上线。

适用于：Hermes、OpenClaw、LangServe、任何 OpenAI 兼容服务。

### Agent Card（可选）

在 Agent 服务根路径放置 `/.well-known/agent.json`，平台上架时自动拉取名称、描述和能力列表。

### WebSocket 模式

Agent 通过 WebSocket 连接 `ws://platform/ws/agent?agent_key=xxx`，处理自定义消息协议。适用于需要实时双向通信的场景。

## 项目结构

```
app/
├── main.py                # FastAPI 入口
├── config.py              # 配置（pydantic-settings, 读 .env）
├── dependencies.py        # 公共依赖注入（JWT 认证、API Key 认证）
├── models/                # SQLAlchemy ORM
│   ├── user.py            #   User, APIKey
│   ├── agent.py           #   Agent
│   └── usage.py           #   UsageRecord
├── schemas/               # Pydantic 请求/响应模型
│   └── openai_compat.py   #   OpenAI 兼容请求/响应模型
├── api/v1/                # REST 路由
│   ├── auth.py            #   注册、登录、刷新 token
│   ├── agents.py          #   Agent CRUD、fetch-card（自动拉取 Agent 信息）
│   ├── invoke.py          #   消费方调用 Agent（非流式 + SSE 流式）
│   ├── openai_compat.py   #   OpenAI 兼容网关（/v1/chat/completions, /v1/models）
│   ├── api_keys.py        #   API Key 管理（含 /default 自动发放、/reveal 查看明文）
│   ├── usage.py           #   用量查询
│   └── dashboard.py       #   控制台统计
├── services/
│   ├── webhook_service.py #   HTTP Webhook 转发（OpenAI 兼容协议）
│   ├── routing_service.py #   路由分发（webhook vs websocket）
│   ├── agent_service.py   #   Agent 业务逻辑
│   ├── metering_service.py#   Token 计量与扣费
│   └── auth_service.py    #   认证、API Key 生成与验证
├── ws/                    # WebSocket 网关
│   ├── gateway.py         #   Agent WebSocket 连接入口
│   └── connection_manager.py # 连接管理
└── core/                  # 基础设施
    ├── database.py        #   AsyncSession 工厂
    ├── redis.py           #   Redis 连接
    ├── security.py        #   JWT、密码哈希、API Key 哈希与加密（Fernet）
    └── exceptions.py      #   自定义异常

web/                       # Next.js 前端
├── src/app/(marketing)/   #   市场页面
│   ├── page.tsx           #     首页（Agent 列表 + 搜索）
│   ├── agents/[id]/       #     Agent 详情（能力、试用、QuickConnect 快速接入）
│   ├── publish/           #     一键上架页面
│   └── docs/              #     用户手册（调用者 + 开发者双视角）
├── src/app/console/       #   控制台（Agent 管理、Key 管理、用量）
├── src/lib/api.ts         #   封装的 API 客户端
└── src/contexts/auth.tsx  #   认证上下文

examples/
└── mock_agent.py          # 最小 OpenAI 兼容 Mock Agent，用于本地测试

alembic/                   # 数据库迁移
sdk/                       # Python SDK（开发中）
```

## 核心流程

### 消费方调用 Agent（推荐：OpenAI 兼容网关）

```
POST /v1/chat/completions
Authorization: Bearer {api_key}

{"model": "Agent名称", "messages": [{"role": "user", "content": "你好"}], "stream": true}
```

1. 平台验证 API Key（SHA-256 哈希匹配）
2. 解析 `model` 字段 → 匹配 Agent（支持 UUID 或名称）
3. 检查余额 ≥ ¥1
4. HTTP POST 到 Agent 的 `/v1/chat/completions` 端点
5. 记录 token 用量，按 `pricing_per_million_tokens` 扣费
6. 返回 OpenAI 格式响应（或 SSE 流式推送）

也保留原生接口 `POST /api/v1/agent/{agent_id}/invoke` 用于细粒度控制。

### Agent 注册

通过 `/publish` 页面或控制台创建 Agent。平台自动拉取 `/.well-known/agent.json` 或通过对话获取 Agent 信息。分类和定价自动推荐。

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql+asyncpg://agentweb:agentweb@localhost:5433/agentweb` |
| `REDIS_URL` | Redis 连接串 | `redis://localhost:6379/0` |
| `JWT_SECRET_KEY` | JWT 签名密钥 | `change-me-to-a-random-secret` |
| `CORS_ORIGINS` | 允许的前端域名，逗号分隔 | `*` |
| `PLATFORM_COMMISSION_RATE` | 平台佣金比例 | `0.18` |

前端环境变量（`web/.env.local`）：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NEXT_PUBLIC_API_URL` | 后端 API 地址（前端 fetch 用） | `http://localhost:8000` |
| `NEXT_PUBLIC_SITE_URL` | 平台对外域名（显示在代码示例和文档中） | `https://your-domain.com` |

> **部署注意**：`NEXT_PUBLIC_SITE_URL` 必须设置为实际的公网地址（如 `https://agentweb.example.com`），否则文档和代码示例中会显示占位域名。`NEXT_PUBLIC_API_URL` 在前后端同域部署时也应改为实际地址。

## 本地测试

```bash
# 启动 Mock Agent
python3 examples/mock_agent.py  # 运行在 http://localhost:9100

# 在 /publish 页面粘贴 http://localhost:9100 上架
# 或在 API 文档页面手动创建 Agent
```

## License

MIT
