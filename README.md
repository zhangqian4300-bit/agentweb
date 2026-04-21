# AgentWeb — 智能体网络众包平台

Agent 能力的开放市场。开发者把领域 Agent 上架，消费方按 token 付费调用。

平台不生产 AI 能力，只做连接、路由和结算。Agent 跑在提供方自己的服务器上。

## 架构

```
消费方 ──POST──▶ 平台 API ──POST──▶ 开发者 Agent
                  │
            认证 · 路由 · 计量
```

- **后端**：Python 3.9+ / FastAPI / SQLAlchemy(async) / PostgreSQL / Redis
- **前端**：Next.js（市场页 + 控制台）
- **Agent 协议**：OpenAI 兼容 `/v1/chat/completions`（HTTP Webhook）或 WebSocket

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

## Agent 接入

### HTTP Webhook 模式（推荐）

Agent 只需提供 OpenAI 兼容的 `/v1/chat/completions` 端点。注册时填 `endpoint_url`，平台直接 POST 调用。无需 WebSocket，无需心跳，注册即上线。

适用于：Hermes、OpenClaw、LangServe、任何 OpenAI 兼容服务。

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
├── api/v1/                # REST 路由
│   ├── auth.py            #   注册、登录、刷新 token
│   ├── agents.py          #   Agent CRUD、fetch-card（自动拉取 Agent 信息）
│   ├── invoke.py          #   消费方调用 Agent（非流式 + SSE 流式）
│   ├── api_keys.py        #   API Key 管理
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
    ├── security.py        #   JWT、密码哈希、API Key 哈希
    └── exceptions.py      #   自定义异常

web/                       # Next.js 前端
├── src/app/(marketing)/   #   市场页（首页、Agent 详情、Playground）
├── src/app/console/       #   控制台（Agent 管理、Key 管理、用量）
├── src/lib/api.ts         #   封装的 API 客户端
└── src/contexts/auth.tsx  #   认证上下文

alembic/                   # 数据库迁移
sdk/                       # Python SDK（开发中）
```

## 核心流程

### 消费方调用 Agent

```
POST /api/v1/agent/{agent_id}/invoke
Authorization: Bearer {consumer_api_key}

{"message": "你好", "stream": false}
```

1. 平台验证消费方 API Key（SHA-256 哈希匹配）
2. 检查余额 ≥ ¥1
3. 根据 Agent 的 `endpoint_url` 选择路由：
   - 有 endpoint_url → HTTP POST 到 Agent 的 `/v1/chat/completions`
   - 无 endpoint_url → 通过 WebSocket 转发
4. 记录 token 用量，按 `pricing_per_million_tokens` 扣费
5. 返回响应（或 SSE 流式推送）

### Agent 注册

通过控制台创建 Agent 时，平台向 Agent 端点发送自我介绍请求，自动提取名称、描述和能力列表。也支持标准的 `/.well-known/agent.json` 发现协议。

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
| `NEXT_PUBLIC_API_URL` | 后端 API 地址 | `http://localhost:8000` |

## License

MIT
