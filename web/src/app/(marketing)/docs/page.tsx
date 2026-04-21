import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const API_BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://your-domain.com";

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm leading-relaxed text-gray-100">
      {children}
    </pre>
  );
}

function Step({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-medium text-white">
          {index}
        </div>
        <div className="mt-2 w-px flex-1 bg-gray-200" />
      </div>
      <div className="pb-10">
        <h3 className="text-lg font-semibold">{title}</h3>
        <div className="mt-2 space-y-3 text-sm leading-relaxed text-gray-600">
          {children}
        </div>
      </div>
    </div>
  );
}

function ConsumerGuide() {
  return (
    <div className="space-y-0">
      <Step index={1} title="注册账号">
        <p>
          访问{" "}
          <Link href="/register" className="text-blue-600 hover:underline">
            注册页面
          </Link>
          ，填写邮箱和密码即可完成注册。新账号会获得初始余额用于体验。
        </p>
      </Step>

      <Step index={2} title="创建 API Key">
        <p>
          登录后进入{" "}
          <Link href="/console/keys" className="text-blue-600 hover:underline">
            控制台 → API Key 管理
          </Link>
          ，点击「创建新 Key」，类型选择 <strong>API Key</strong>。
        </p>
        <p>
          创建后可以随时通过眼睛图标查看完整 Key。调用 Agent 时需要用这个 Key 进行认证。
        </p>
      </Step>

      <Step index={3} title="浏览市场，选择 Agent">
        <p>
          回到{" "}
          <Link href="/" className="text-blue-600 hover:underline">
            首页市场
          </Link>
          ，按分类、关键词搜索你需要的 Agent。点击进入详情页可以查看能力描述、定价、在线试用。
        </p>
      </Step>

      <Step index={4} title="接入调用（OpenAI 兼容）">
        <div className="flex items-center gap-2">
          <Badge>推荐</Badge>
          <span>兼容所有支持 OpenAI API 的框架和工具</span>
        </div>
        <p>
          平台提供 OpenAI 兼容的 <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">/v1/chat/completions</code> 接口。
          你的本地 Agent、LangChain、CrewAI、Dify 等框架可以直接对接，无需任何适配代码。
        </p>

        <p className="font-medium text-gray-700">Python（OpenAI SDK）：</p>
        <CodeBlock>{`from openai import OpenAI

client = OpenAI(
    base_url="${API_BASE}/v1",
    api_key="{your_api_key}",
)

# 非流式
resp = client.chat.completions.create(
    model="{agent_name}",
    messages=[{"role": "user", "content": "你好"}],
)
print(resp.choices[0].message.content)

# 流式
stream = client.chat.completions.create(
    model="{agent_name}",
    messages=[{"role": "user", "content": "你好"}],
    stream=True,
)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")`}</CodeBlock>

        <p className="font-medium text-gray-700">Node.js（OpenAI SDK）：</p>
        <CodeBlock>{`import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${API_BASE}/v1",
  apiKey: "{your_api_key}",
});

const resp = await client.chat.completions.create({
  model: "{agent_name}",
  messages: [{ role: "user", content: "你好" }],
});
console.log(resp.choices[0].message.content);`}</CodeBlock>

        <p>
          其中 <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">model</code> 填写
          Agent 名称或 Agent ID 均可。每个 Agent 详情页都提供了一键复制调用代码的功能。
        </p>
      </Step>

      <Step index={5} title="原生 API（可选）">
        <p>
          如果需要细粒度控制 session 或传递自定义 metadata，也可以使用平台原生接口：
        </p>
        <CodeBlock>{`POST ${API_BASE}/api/v1/agent/{agent_id}/invoke

Headers:
  Authorization: Bearer {your_api_key}
  Content-Type: application/json

Body:
{
  "message": "你好",
  "session_id": "可选，用于多轮会话",
  "stream": false,
  "metadata": {}
}`}</CodeBlock>
      </Step>

      <Step index={6} title="查看用量与费用">
        <p>
          在{" "}
          <Link href="/console/usage/consumer" className="text-blue-600 hover:underline">
            控制台 → 调用记录
          </Link>
          {" "}中可以查看每次调用的 token 用量和扣费明细。费用按 Agent 定价的「每百万 tokens」计算，从账户余额中实时扣除。
        </p>
      </Step>
    </div>
  );
}

function DeveloperGuide() {
  return (
    <div className="space-y-0">
      <Step index={1} title="注册账号">
        <p>
          访问{" "}
          <Link href="/register" className="text-blue-600 hover:underline">
            注册页面
          </Link>
          ，注册一个开发者账号。同一个账号可以同时作为开发者和使用者。
        </p>
      </Step>

      <Step index={2} title="准备你的 Agent 端点">
        <p>
          你的 Agent 需要提供一个 <strong>OpenAI 兼容</strong> 的 HTTP 端点，
          即实现 <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">POST /v1/chat/completions</code> 接口。
        </p>
        <p>平台会向你的端点发送如下格式的请求：</p>
        <CodeBlock>{`POST https://your-agent.example.com/v1/chat/completions

Headers:
  Authorization: Bearer {endpoint_api_key}  (如果你设置了)
  Content-Type: application/json

Body:
{
  "model": "default",
  "messages": [
    {"role": "user", "content": "用户消息"}
  ],
  "stream": false
}`}</CodeBlock>
        <p>
          支持非流式和 SSE 流式两种响应模式。如果你使用 Hermes、OpenClaw、FastAPI 等框架，
          大多已经内置了 OpenAI 兼容接口。
        </p>
      </Step>

      <Step index={3} title="（可选）提供 Agent Card">
        <p>
          在你的 Agent 服务根路径放置{" "}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">/.well-known/agent.json</code>
          ，平台会自动拉取 Agent 的名称、描述和能力列表：
        </p>
        <CodeBlock>{`{
  "name": "蛋白质结构预测 Agent",
  "description": "基于 AlphaFold 的蛋白质三维结构预测与分析",
  "version": "1.0.0",
  "capabilities": [
    {
      "name": "结构预测",
      "description": "输入氨基酸序列，预测蛋白质三维结构"
    }
  ]
}`}</CodeBlock>
        <p>
          如果没有 Agent Card，平台会尝试通过对话自动获取信息，或者你也可以手动填写。
        </p>
      </Step>

      <Step index={4} title="上架到市场">
        <p>
          登录后进入{" "}
          <Link href="/console/agents/new" className="text-blue-600 hover:underline">
            控制台 → 创建 Agent
          </Link>
          ，按照引导完成三步操作：
        </p>
        <ol className="ml-4 list-decimal space-y-1">
          <li>填写 Agent 端点 URL（和可选的端点认证密钥），平台自动拉取信息</li>
          <li>确认或编辑 Agent 名称、描述、能力列表</li>
          <li>选择分类、设置定价，预览后发布</li>
        </ol>
        <p>
          发布后 Agent 会自动上线，出现在市场中供其他用户发现和调用。
        </p>
      </Step>

      <Step index={5} title="定价">
        <p>
          定价单位为 <strong>¥ / 百万 tokens</strong>。平台会根据每次调用的实际 token 用量，
          按你设定的价格向使用者收费。平台收取少量佣金，其余作为你的收益。
        </p>
        <p>
          建议参考同类 Agent 的定价，以及你底层模型的成本来设定合理价格。
        </p>
      </Step>

      <Step index={6} title="查看收益">
        <p>
          在{" "}
          <Link href="/console/usage/provider" className="text-blue-600 hover:underline">
            控制台 → 收益记录
          </Link>
          {" "}中查看每次被调用的详细记录，包括 token 用量、收入金额。
          收益实时结算到你的账户余额中。
        </p>
      </Step>
    </div>
  );
}

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold">使用手册</h1>
        <p className="mt-2 text-gray-500">
          AgentWeb 是一个 Agent 能力的开放市场。开发者将领域 Agent 上架，使用者按量付费调用。
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="consumer">
            <TabsList className="mb-6 grid w-full grid-cols-2">
              <TabsTrigger value="consumer">调用 Agent</TabsTrigger>
              <TabsTrigger value="developer">发布 Agent</TabsTrigger>
            </TabsList>
            <TabsContent value="consumer">
              <div className="mb-6">
                <p className="text-sm text-gray-500">
                  你想调用市场上的 Agent？按以下步骤快速开始。
                </p>
              </div>
              <ConsumerGuide />
            </TabsContent>
            <TabsContent value="developer">
              <div className="mb-6">
                <p className="text-sm text-gray-500">
                  你有一个 Agent 想上架到市场？按以下步骤发布。
                </p>
              </div>
              <DeveloperGuide />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="mt-8 rounded-lg border bg-blue-50 p-6">
        <h2 className="font-semibold text-blue-800">核心概念</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-blue-700">API Key</dt>
            <dd className="mt-1 text-sm text-blue-600/80">
              使用者调用 Agent 时的认证凭证，类型为 <code className="text-xs">api_key</code>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-blue-700">Agent Key</dt>
            <dd className="mt-1 text-sm text-blue-600/80">
              开发者注册 Agent 时的认证凭证，类型为 <code className="text-xs">agent_key</code>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-blue-700">OpenAI 兼容接口</dt>
            <dd className="mt-1 text-sm text-blue-600/80">
              平台对外提供 <code className="text-xs">/v1/chat/completions</code>，任何支持 OpenAI API 的工具可直接接入
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-blue-700">Agent Card</dt>
            <dd className="mt-1 text-sm text-blue-600/80">
              开发者 Agent 的自描述文件 <code className="text-xs">/.well-known/agent.json</code>，用于自动填充上架信息
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
