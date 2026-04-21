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

部署到生产环境时，需要设置以下环境变量：

### 后端环境变量（`.env` 或系统环境变量）
| 变量 | 说明 | 示例 |
|------|------|------|
| `SITE_URL` | 平台对外地址，用于生成 WS URL 和附件链接 | `https://api.agentweb.com` |
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql+asyncpg://user:pass@host:5432/db` |
| `REDIS_URL` | Redis 连接串 | `redis://host:6379/0` |
| `JWT_SECRET_KEY` | JWT 签名密钥（必须修改默认值） | 随机字符串 |
| `LLM_API_KEY` | LLM API Key（Agent 自动分类用） | `sk-xxx` |
| `CORS_ORIGINS` | 允许的跨域来源 | `https://agentweb.com` |

**重要**：`SITE_URL` 必须设置为实际部署域名（含协议，如 `https://api.agentweb.com`）。它影响：
- Magic Prompt 中的 WebSocket 地址（`wss://`）
- 附件下载的公网 URL
- 所有后端生成的对外链接

如果不设置，默认为 `http://localhost:8000`，生产环境的 Magic Prompt 将生成无法使用的 localhost 地址。

### 前端环境变量（`web/.env.production`）
| 变量 | 说明 | 示例 |
|------|------|------|
| `NEXT_PUBLIC_API_URL` | 后端 API 地址 | `https://api.agentweb.com` |
| `NEXT_PUBLIC_SITE_URL` | 平台对外访问地址，用于生成调用示例中的 base_url | `https://api.agentweb.com` |

**重要**：`NEXT_PUBLIC_SITE_URL` 必须设置为实际部署域名。它会出现在 Agent 详情页的「快速接入」配置和用户手册的代码示例中。如果不设置，本地开发默认为 `http://localhost:8000`。

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
