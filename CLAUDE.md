# AgentWeb - 智能体网络众包平台

## 项目简介
Agent 能力的开放市场。个人开发者把领域 Agent 上架，消费方按 token 付费调用。

## 技术栈
- 后端：Python 3.9 + FastAPI + SQLAlchemy(async) + asyncpg + Redis
- 数据库：PostgreSQL (Docker, 端口 5433)，Redis (Docker, 端口 6379)
- 协议：基于 Google A2A 协议扩展
- 前端（规划中）：Next.js
- 插件 SDK（规划中）：Python

## 快速启动
```bash
# 启动数据库
docker-compose up -d

# 安装依赖
pip install -r requirements.txt

# 运行迁移
python3 -m alembic upgrade head

# 启动后端
python3 -m uvicorn app.main:app --reload --port 8000

# 启动前端
cd web && npm install && npm run dev
```

API 文档：http://localhost:8000/docs

## 部署配置

部署到生产环境时，**必须正确设置环境变量**，否则前端 API 请求会打到 localhost 导致功能不可用。

假设部署地址为 `http://YOUR_SERVER_IP:3000`（前端）和 `http://YOUR_SERVER_IP:8000`（后端），按以下步骤配置：

### 第一步：后端环境变量

创建项目根目录下的 `.env` 文件（已在 `.gitignore` 中，不会提交）：

```bash
# .env — 后端配置
DATABASE_URL=postgresql+asyncpg://agentweb:agentweb@localhost:5433/agentweb
REDIS_URL=redis://localhost:6379/0
JWT_SECRET_KEY=替换为随机字符串
CORS_ORIGINS=http://YOUR_SERVER_IP:3000
SITE_URL=http://YOUR_SERVER_IP:3000
LLM_API_KEY=你的通义千问API Key
LLM_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_MODEL=qwen-plus
```

各变量说明：

| 变量 | 必须 | 说明 | 不设置的后果 |
|------|------|------|-------------|
| `SITE_URL` | **是** | 平台对外访问地址（含协议和端口） | Magic Prompt 生成 `ws://localhost:8000`，Agent 无法连接 |
| `DATABASE_URL` | **是** | PostgreSQL 连接串 | 无法启动 |
| `REDIS_URL` | **是** | Redis 连接串 | 无法启动 |
| `JWT_SECRET_KEY` | **是** | JWT 签名密钥 | 使用不安全的默认值 |
| `LLM_API_KEY` | **是** | 通义千问 API Key（[DashScope 申请](https://dashscope.console.aliyun.com/)） | Agent 自动分类、测试评分、定价建议全部报错 |
| `CORS_ORIGINS` | **是** | 允许的跨域来源，设为前端地址 | 浏览器跨域请求被拦截 |
| `LLM_API_BASE` | 否 | LLM API 地址 | 默认通义千问 |
| `LLM_MODEL` | 否 | LLM 模型 | 默认 qwen-plus |

### 第二步：前端环境变量

创建 `web/.env`（开发模式）或 `web/.env.production`（生产构建）：

```bash
# web/.env — 前端配置
NEXT_PUBLIC_API_URL=http://YOUR_SERVER_IP:3000
NEXT_PUBLIC_SITE_URL=http://YOUR_SERVER_IP:3000
```

| 变量 | 必须 | 说明 | 不设置的后果 |
|------|------|------|-------------|
| `NEXT_PUBLIC_API_URL` | **是** | 浏览器中 JS 请求的后端地址 | 前端所有 API 请求打到 `localhost:8000`，**整个网站不可用** |
| `NEXT_PUBLIC_SITE_URL` | **是** | 用于生成代码示例中的 base_url | 用户手册和快速接入示例显示 localhost |

**注意**：
- `NEXT_PUBLIC_` 前缀的变量会被编译进前端 JS，修改后需要**重启前端**才生效
- 如果用 `npm run dev` 运行，读 `web/.env`；如果用 `npm run build && npm start`，读 `web/.env.production`
- `NEXT_PUBLIC_API_URL` 和 `SITE_URL` 通常设为相同值（前端通过 Next.js 反向代理转发 `/api` 请求到后端）

### 第三步：启动服务

```bash
# 1. 启动数据库
docker-compose up -d

# 2. 运行迁移
python3 -m alembic upgrade head

# 3. 启动后端
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# 4. 启动前端
cd web && npm run dev
```

### 快速检查清单

部署后依次验证：
1. `curl http://YOUR_SERVER_IP:3000/api/v1/agents` — 应返回 JSON（不是 HTML 404）
2. 浏览器打开 `http://YOUR_SERVER_IP:3000` — 首页正常加载
3. 注册账号 → 上架页面 → 选择端点 URL 模式 → 输入 Agent 地址 → 连接并探测
4. 如果 Agent 分类/测试评分报错，检查 `LLM_API_KEY` 是否设置

## 项目结构
```
app/
├── main.py              # FastAPI 入口
├── config.py            # 配置（pydantic-settings）
├── dependencies.py      # 公共依赖注入
├── models/              # SQLAlchemy ORM（users, api_keys, agents, usage_records）
├── schemas/             # Pydantic 请求/响应模型
├── api/v1/              # REST 路由（auth, users, api_keys, agents, invoke, usage）
├── ws/                  # WebSocket 网关（gateway, connection_manager, protocol）
├── services/            # 业务逻辑（auth, agent, routing, metering, webhook）
└── core/                # 基础设施（database, redis, security, exceptions）
```

## 开发进度
- [x] M1：平台后端（认证、Agent Card、WebSocket 网关、路由、计量）
- [ ] M2：插件 SDK（Python SDK，让 Agent 开发者快速接入）
- [x] M3：前端市场页面（Next.js，Agent 列表、搜索、控制台、一键上架、文档）
- [ ] M4：打磨 + 冷启动

## Agent 接入模式
平台支持三种 Agent 接入模式：

### HTTP Webhook 模式（推荐）
- Agent 提供 OpenAI 兼容的 `/v1/chat/completions` 端点
- 注册时填 `endpoint_url`（Agent 地址）和 `endpoint_api_key`（可选认证密钥）
- 平台收到消费方请求后直接 POST 到 Agent 端点，支持非流式和 SSE 流式
- 无需 WebSocket 连接、无需心跳，注册即上线
- 适用于 Hermes、OpenClaw 等已有 HTTP 服务的 Agent 框架

### WebSocket 模式
- Agent 通过 WebSocket 连接到 `ws://platform/ws/agent?agent_key=xxx`
- 需要处理自定义消息协议（request/response/stream_chunk/stream_end）和心跳
- 适用于需要实时双向通信的场景

### Channel 模式（Magic Prompt）
- 开发者在平台生成 Prompt，复制给自己的 Agent（如 Hermes）
- Agent 执行内嵌 Python 脚本，通过 Reverse WebSocket 连接平台
- 首次连接自动触发自我介绍 → 平台解析并创建 Agent 记录
- 无需公网 IP、无需编写代码，粘贴即上线
- 端点：`/ws/agent-channel?token=xxx`

## 关键设计决策
- Session 管理由 Agent 框架自行维护，平台只做 sticky routing
- Agent 跑在提供方服务器，平台只做路由（不托管）
- 单进程 ConnectionManager（内存 dict），后续扩展时改 Redis pub/sub
- API Key 存 SHA-256 哈希（用于验证）+ Fernet 加密密文（用于回显），支持随时查看
- Agent 的 endpoint_api_key 明文存储（用于平台代理调用 Agent 端点）
- 消费方流式用 SSE（非 WebSocket）
- Token 计量信任 Agent 上报（MVP 阶段）

## 相关文档
- MVP_PLAN.md：完整的产品方案和模块拆解
