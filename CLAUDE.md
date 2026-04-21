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

# 启动服务
python3 -m uvicorn app.main:app --reload --port 8000
```

API 文档：http://localhost:8000/docs

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
- [ ] M3：前端市场页面（Next.js，Agent 列表、搜索、控制台）
- [ ] M4：打磨 + 冷启动

## Agent 接入模式
平台支持两种 Agent 接入模式，注册时根据是否填写 `endpoint_url` 自动选择：

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

## 关键设计决策
- Session 管理由 Agent 框架自行维护，平台只做 sticky routing
- Agent 跑在提供方服务器，平台只做路由（不托管）
- 单进程 ConnectionManager（内存 dict），后续扩展时改 Redis pub/sub
- API Key 只存 SHA-256 哈希，明文创建时返回一次
- Agent 的 endpoint_api_key 明文存储（用于平台代理调用 Agent 端点）
- 消费方流式用 SSE（非 WebSocket）
- Token 计量信任 Agent 上报（MVP 阶段）

## 相关文档
- MVP_PLAN.md：完整的产品方案和模块拆解
