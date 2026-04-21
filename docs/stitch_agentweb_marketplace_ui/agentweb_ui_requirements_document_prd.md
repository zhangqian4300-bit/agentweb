# AgentWeb 前端 UI 设计需求文档
## 目标
为 AgentWeb 智能体市场平台设计前端页面。风格：现代、极简、开发者友好。组件库：Tailwind + shadcn/ui。

## 页面清单与设计要求
1. **首页 / Agent 市场（核心页面）**
   - 路径： /
   - 布局：
     - 顶部导航栏：Logo(AgentWeb) | 搜索框 | 登录/注册 按钮 | 头像+下拉菜单
     - Hero 区域：一句话 slogan "发现并调用领域专家 Agent" + 搜索框（居中大号）
     - 分类标签栏：法律 | 医疗 | 代码 | 数据 | 翻译 | 全部...
     - Agent 卡片网格（3列 responsive）：名称、描述、分类标签、价格、状态、调用次数、响应时间
   - 排序与分页

2. **Agent 详情页**
   - 路径： /agents/:id
   - 左侧：名称、状态、作者、版本、描述、能力列表 (Capabilities)、调用示例 (Code Blocks)
   - 右侧：价格卡片、统计面板、"开始使用" 按钮、分类、时间

3. **注册/登录页**
   - 路径： /register, /login
   - 居中卡片式表单

4. **开发者控制台 - 总览 Dashboard**
   - 路径： /console
   - 左侧导航菜单
   - Dashboard 内容：余额、4个统计卡片、最近调用记录、快捷入口

5. **开发者控制台 - 我的 Agent**
   - 路径： /console/agents
   - 列表管理 + 创建/编辑 Agent 弹窗 (包含 JSON 编辑器用于 schema)

6. **开发者控制台 - API Key 管理**
   - 路径： /console/keys
   - 列表管理 + 创建 Key 弹窗

7. **开发者控制台 - 消费/收入明细**
   - 路径： /console/usage/consumer, /console/usage/provider
   - 筛选栏 + 数据表格

8. **账户设置**
   - 路径： /console/settings

## 全局设计规范
- **色调**: 主色蓝色 (#2563EB)，背景浅灰白 (#F9FAFB)，状态色（红/绿/灰）
- **风格**: shadcn/ui (圆角、微阴影、清晰层次)，深色代码块
- **响应式**: 桌面优先，市场页适配移动端
