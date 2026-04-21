# AgentWeb — 智能体网络众包平台 MVP 方案

## 一、产品定位

**一句话定义：** 一个 Agent 能力的开放市场。个人开发者把自己沉淀的领域专长通过 Agent 形式上架，中小团队和其他开发者按量付费调用。

**核心差异化：** 网络里的 Agent 不是 LLM 的二道贩子，而是"LLM + 私有知识/工具/工程"的组合体。消费方买的是别人的领域积累，不是通用 AI 能力。

### 角色定义

| 角色 | 是谁 | 做什么 |
|------|------|--------|
| 提供方 | 个人开发者 | 将自己的领域 Agent 部署到云服务器，接入平台对外服务 |
| 消费方 | 中小团队、个人开发者 | 通过平台发现并调用 Agent，按 token 付费 |
| 平台 | AgentWeb | 不生产能力，只做连接、路由、结算和基础安全 |

---

## 二、核心闭环

MVP 只需要跑通一件事：**一个开发者把 Agent 挂上来 → 另一个开发者找到并调用它 → 钱能到账。**

```
提供方                         平台                          消费方
  │                             │                              │
  │  1. 安装插件，贴链接+key     │                              │
  │  → Agent 自省生成 Card      │                              │
  │  → 注册到平台               │                              │
  │  → WebSocket 长连接待命     │                              │
  │                             │   2. 浏览 Agent 列表          │
  │                             │   ← 搜索/选择 Agent           │
  │                             │                              │
  │                             │   3. 发起调用（API + key）     │
  │                             │ ──── 路由转发 ────→           │
  │  ← 收到请求，本地处理        │                              │
  │  → 返回结果                 │ ←─── 结果返回 ────            │
  │                             │   计量 token，扣费            │
  │                             │                              │
  │  4. 查看收入面板             │   4. 查看消费明细             │
```

---

## 三、模块拆解

### 3.1 平台侧

#### 3.1.1 用户系统
- 注册 / 登录（邮箱 + 密码，或 GitHub OAuth）
- 角色：同一个账号既可以是提供方也可以是消费方
- API Key 管理：提供方拿 agent_key 接入 Agent，消费方拿 api_key 调用 Agent
- 账户余额：充值、消费、收入，统一在一个账户里

#### 3.1.2 Agent 注册中心
- 接收并存储 Agent Card（基于 A2A 协议扩展）
- Agent Card 字段定义：

```json
{
  "agent_id": "唯一标识，平台生成",
  "name": "劳动法合同审查助手",
  "description": "基于中国劳动法知识库，审查劳动合同条款的合规性",
  "author": "开发者名称",
  "version": "1.0.0",
  "capabilities": [
    {
      "name": "contract_review",
      "description": "审查劳动合同，指出不合规条款",
      "input_schema": { "type": "object", "properties": { "contract_text": { "type": "string" } } },
      "output_schema": { "type": "object", "properties": { "issues": { "type": "array" } } }
    }
  ],
  "pricing": {
    "unit": "per_million_tokens",
    "price": 50.00,
    "currency": "CNY"
  },
  "status": "online | offline",
  "stats": {
    "total_calls": 0,
    "avg_response_time_ms": 0,
    "uptime_percent": 0
  },
  "created_at": "2026-04-20T00:00:00Z"
}
```

- 心跳监控：Agent 每 30s 心跳，60s 无心跳标记离线
- 自动下架：连续离线超过 24 小时，自动从列表隐藏，恢复后自动上架

#### 3.1.3 请求网关
- 认证：验证消费方 api_key
- 路由：根据 agent_id 找到对应的 WebSocket 连接，转发请求
- Session 亲和性：同一个 session_id 的请求路由到同一个 Agent 实例（支持多轮对话，session 状态由 Agent 框架自行管理）
- 流式传输：支持 streaming 响应（WebSocket 天然支持）
- 超时处理：单次请求最大超时 5 分钟，超时返回错误

#### 3.1.4 计量与结算
- Token 计量：平台在网关层统计请求和响应的 token 数
- 扣费：实时从消费方账户扣除
- 分账：扣除平台佣金后，计入提供方账户
- 账单：消费方可查消费明细，提供方可查收入明细
- 佣金比例：MVP 阶段建议 15-20%（参考 App Store 对小开发者的费率）

#### 3.1.5 基础安全
- 请求限流：每个消费方 api_key 有默认 QPS 上限
- 输出过滤：对 Agent 返回内容做基础的安全审查（敏感词/有害内容检测）
- 影响隔离：单个 Agent 异常不影响其他 Agent 和平台整体
- 举报机制：消费方可举报 Agent，平台人工处理

#### 3.1.6 Agent 市场页面（极简）
- Agent 列表：卡片式展示，显示名称、描述、价格、在线状态、调用次数
- 分类：手动设定的领域分类标签（法律、医疗、代码、数据、翻译...）
- 搜索：关键词搜索 Agent 名称和描述
- 详情页：完整 Agent Card 信息 + 调用示例 + 在线状态
- PGC 推荐位：首页展示平台精选的高质量 Agent

---

### 3.2 插件侧（跑在提供方服务器上）

这是提供方接入平台的桥梁，目标体验：

> 开发者对自己的 Agent 说："安装 agentweb 插件，接入地址是 https://agentweb.io，我的 key 是 ak_xxxx"
> → Agent 自动完成注册和上线

#### 插件架构

```
agentweb-plugin
├── 核心层（所有框架通用）
│   ├── 平台通信（WebSocket 连接、心跳、自动重连）
│   ├── 注册（提交 Agent Card 到平台）
│   ├── 请求桥接（平台请求 ↔ 本地 Agent 调用）
│   └── Token 上报（本地统计 token 用量，与平台对账）
│
└── 适配层（每个框架一个适配器）
    ├── OpenClaw adapter
    ├── 通用 HTTP adapter（兜底：任何能暴露 HTTP 接口的 Agent）
    └── 更多框架适配器（后续按需添加）
```

#### 插件工作流程

1. **安装**：`pip install agentweb-plugin` 或对应框架的 skill 安装方式
2. **配置**：提供平台地址 + agent_key
3. **自省**：插件从 Agent 框架获取能力描述，自动生成 Agent Card
4. **注册**：向平台 API 提交 Agent Card，开发者确认/修改后生效
5. **上线**：建立 WebSocket 长连接，开始接收请求
6. **运行**：收到请求 → 调用本地 Agent → 返回结果 → 上报 token 用量

#### WebSocket 连接策略

- 心跳：每 30s 发 ping
- 断线检测：连续 2 次 ping 无响应，判定断开
- 自动重连：指数退避（1s → 2s → 4s → ... → 最大 60s）
- 重连认证：带 agent_key，平台识别为同一个 Agent
- 请求缓冲：短暂断线期间（<30s）平台缓冲请求，重连后补发

---

### 3.3 消费方调用

消费方通过标准 REST API 调用 Agent，格式对齐 A2A 协议：

#### 调用示例

```bash
# 单轮调用
curl -X POST https://api.agentweb.io/v1/agent/{agent_id}/invoke \
  -H "Authorization: Bearer {api_key}" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "请审查以下劳动合同条款：...",
    "stream": true
  }'

# 多轮调用（带 session_id）
curl -X POST https://api.agentweb.io/v1/agent/{agent_id}/invoke \
  -H "Authorization: Bearer {api_key}" \
  -d '{
    "session_id": "sess_abc123",
    "message": "上一条合同的第三条有什么问题？",
    "stream": true
  }'
```

#### 响应格式

```json
{
  "request_id": "req_xxx",
  "session_id": "sess_abc123",
  "response": "经审查，该合同第三条存在以下问题：...",
  "usage": {
    "input_tokens": 1520,
    "output_tokens": 830,
    "total_tokens": 2350
  },
  "cost": {
    "amount": 0.1175,
    "currency": "CNY"
  }
}
```

---

## 四、技术选型建议

| 层面 | 选型 | 理由 |
|------|------|------|
| 协议 | A2A（Google Agent-to-Agent）扩展 | 已定义 Agent Card、任务生命周期、流式交互，在此基础上扩展定价和计量字段 |
| 平台后端 | Go 或 Node.js | 高并发 WebSocket 场景，两者都合适。Go 性能更好，Node 生态更丰富 |
| 数据库 | PostgreSQL | 用户、Agent Card、账单、交易记录 |
| 缓存 | Redis | Session 亲和性映射、在线状态、限流计数器 |
| 消息/网关 | 自建 WebSocket 网关 | 核心路由逻辑是平台命脉，不依赖第三方 |
| 前端 | React / Next.js | 市场页面 + 开发者控制台，SSR 有利于 SEO |
| 插件 | Python SDK（优先）| Agent 框架生态以 Python 为主 |
| 部署 | 容器化（Docker + K8s） | 网关层需要弹性伸缩 |
| 支付 | 接入支付宝/微信支付 | 国内开发者的主流充值方式 |

---

## 五、MVP 明确不做的清单

| 不做的事 | 为什么 |
|----------|--------|
| 平台托管 Agent | 初期不承担运行责任，提供方自行部署 |
| 部署辅助（模板、一键上云） | 目标用户本身有云服务器，不需要解决上云问题 |
| Agent 间调用（编排） | A2A 支持但 MVP 不需要，场景不成熟 |
| 评分评价系统 | 初期 Agent 少，评分无统计意义，用调用量和 PGC 推荐替代 |
| 智能推荐 / 语义匹配 | 初期手动分类 + 关键词搜索足够 |
| 精细化权限控制 | 初期全开放，后续按需加 |
| 自动提现 | 初期人工打款或月结，跑通后再做 |
| 多语言插件 | 先做 Python SDK，覆盖主流 Agent 框架 |
| 移动端 | 纯 Web，开发者用不到 App |

---

## 六、冷启动策略建议

### 供给侧（Agent 从哪来）

1. **PGC 先行**：平台自己做 5-10 个高质量 Agent 上架，覆盖高频场景（代码审查、文档翻译、数据分析、合同审查...），作为质量标杆和使用示范
2. **开发者社区推广**：在 V2EX、掘金、即刻等社区发布，强调"你的 Agent 可以赚钱"
3. **定向邀请**：找已经在做垂直领域 Agent 的开发者，一对一邀请接入
4. **接入激励**：早期接入的 Agent 给首页推荐位 + 佣金减免

### 需求侧（谁来用）

1. **自产自销**：PGC 的 Agent 本身就能吸引一波用户体验
2. **场景驱动**：围绕具体场景做内容（"用 30 块钱让 AI 审完一份合同"），比抽象推广更有效
3. **API 友好**：开发者一看文档就能调用，降低试用门槛

### 飞轮

```
更多优质 Agent → 更多消费方 → 提供方赚到钱 → 更多开发者接入 → 更多优质 Agent
```

关键引爆点：**让前 10 个提供方真正赚到钱**。哪怕平台补贴，也要让早期参与者看到经济回报。

---

## 七、里程碑建议

```
M1（第 1-2 周）：基础设施
  - 用户系统 + API Key 管理
  - Agent Card 数据模型 + 注册 API
  - WebSocket 网关原型（能连接、能转发）

M2（第 3-4 周）：核心闭环
  - 插件核心层（通信 + 注册 + 桥接）
  - OpenClaw 适配器 + 通用 HTTP 适配器
  - 请求路由 + Session 亲和性
  - Token 计量 + 基础扣费逻辑

M3（第 5-6 周）：可用产品
  - Agent 市场页面（列表 + 搜索 + 详情）
  - 开发者控制台（收入/消费面板）
  - 基础安全（限流 + 输出过滤）
  - 充值 + 结算流程
  - PGC Agent 上架

M4（第 7-8 周）：打磨 + 冷启动
  - 接入文档 + 使用文档
  - 插件安装体验优化
  - 邀请首批外部开发者测试
  - 根据反馈迭代
```

---

## 八、核心风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Agent 质量参差不齐 | 消费方体验差，留不住人 | PGC 打底 + 调用量/在线率排序 + 举报下架机制 |
| 冷启动双边难题 | 没 Agent 没人来，没人来没 Agent | 平台自建 PGC Agent 先跑起需求侧 |
| 提供方赚不到钱 | 开发者流失 | 早期佣金减免 + 推荐位激励 + 必要时平台补贴 |
| Token 计量争议 | 提供方和平台对不上账 | 插件侧 + 平台侧双向计量，提供对账接口 |
| 安全事故 | 有害输出导致平台风险 | 基础输出过滤 + 影响隔离 + 快速下架能力 |
