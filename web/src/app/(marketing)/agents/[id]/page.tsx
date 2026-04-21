"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import type { Agent } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function Playground({ agentId }: { agentId: string }) {
  const { user } = useAuth();
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const responseRef = useRef<HTMLPreElement>(null);

  const handleSend = useCallback(async () => {
    if (!message.trim() || !apiKey) return;
    setSending(true);
    setError("");
    setResponse("");

    try {
      const res = await fetch(`${API_BASE}/api/v1/agent/${agentId}/invoke`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ message: message.trim(), stream: true }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `请求失败 (${res.status})`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("无法读取响应流");

      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const dataStr = line.slice(5).trim();
          try {
            const data = JSON.parse(dataStr);
            if (data.content) {
              full += data.content;
              setResponse(full);
            }
          } catch {
            // skip non-JSON lines
          }
        }
      }
      if (!full) setResponse("(空响应)");
    } catch (err) {
      setError(err instanceof Error ? err.message : "调用失败");
    } finally {
      setSending(false);
    }
  }, [agentId, message, apiKey]);

  if (!user) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-gray-400">
          <Link href={`/login?redirect=/agents/${agentId}`} className="text-blue-600 hover:underline">
            登录
          </Link>
          {" "}后可在此试用 Agent
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">在线试用</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm">API Key</Label>
          <Input
            type="password"
            placeholder="粘贴你的 API Key（sk_...）"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <p className="text-xs text-gray-400">
            还没有？
            <Link href="/console/keys" className="text-blue-600 hover:underline">去创建</Link>
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">消息</Label>
          <Textarea
            placeholder="输入你想对 Agent 说的话..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend();
            }}
          />
        </div>

        <Button
          onClick={handleSend}
          disabled={sending || !message.trim() || !apiKey}
          className="w-full"
        >
          {sending ? "调用中..." : "发送"}
        </Button>

        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>
        )}

        {response && (
          <div className="space-y-2">
            <Label className="text-sm">响应</Label>
            <pre
              ref={responseRef}
              className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-900 p-4 text-sm text-gray-100"
            >
              {response}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.id) return;
    api<Agent>(`/api/v1/agents/${params.id}`)
      .then(setAgent)
      .catch(() => setAgent(null))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="h-96 animate-pulse rounded-lg bg-gray-200" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="py-20 text-center text-gray-400">Agent 不存在或已下架</div>
    );
  }

  const baseUrl = API_BASE;
  const curlExample = [
    `curl -X POST ${baseUrl}/api/v1/agent/${agent.id}/invoke \\`,
    `  -H "Authorization: Bearer {your_api_key}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{`,
    `    "message": "你好",`,
    `    "stream": false`,
    `  }'`,
  ].join("\n");

  const pythonExample = [
    `import requests`,
    ``,
    `resp = requests.post(`,
    `    "${baseUrl}/api/v1/agent/${agent.id}/invoke",`,
    `    headers={"Authorization": "Bearer {your_api_key}"},`,
    `    json={"message": "你好", "stream": False}`,
    `)`,
    `print(resp.json())`,
  ].join("\n");

  const jsExample = [
    `const resp = await fetch(`,
    `  "${baseUrl}/api/v1/agent/${agent.id}/invoke",`,
    `  {`,
    `    method: "POST",`,
    `    headers: {`,
    `      "Authorization": "Bearer {your_api_key}",`,
    `      "Content-Type": "application/json",`,
    `    },`,
    `    body: JSON.stringify({`,
    `      message: "你好",`,
    `      stream: false,`,
    `    }),`,
    `  }`,
    `);`,
    `const data = await resp.json();`,
    `console.log(data);`,
  ].join("\n");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-gray-400">
        <Link href="/" className="hover:text-gray-600">市场</Link>
        <span className="mx-2">/</span>
        {agent.category && (
          <>
            <span>{agent.category}</span>
            <span className="mx-2">/</span>
          </>
        )}
        <span className="text-gray-700">{agent.name}</span>
      </nav>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Main */}
        <div className="lg:col-span-2 space-y-8">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{agent.name}</h1>
              <Badge variant={agent.status === "online" ? "default" : "secondary"}>
                {agent.status === "online" ? "在线" : "离线"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-gray-400">
              {agent.author_name && <span>{agent.author_name} · </span>}v{agent.version}
            </p>
            <p className="mt-4 leading-relaxed text-gray-600">
              {agent.description || "暂无描述"}
            </p>
          </div>

          <Separator />

          {/* Capabilities */}
          {agent.capabilities.length > 0 && (
            <div>
              <h2 className="mb-4 text-lg font-semibold">能力列表</h2>
              <div className="space-y-3">
                {agent.capabilities.map((cap, idx) => (
                  <Card key={idx}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{cap.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-500">{cap.description}</p>
                      {cap.input_schema && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-gray-400">输入 Schema</summary>
                          <pre className="mt-1 overflow-x-auto rounded bg-gray-900 p-3 text-xs text-gray-100">
                            {JSON.stringify(cap.input_schema, null, 2)}
                          </pre>
                        </details>
                      )}
                      {cap.output_schema && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-gray-400">输出 Schema</summary>
                          <pre className="mt-1 overflow-x-auto rounded bg-gray-900 p-3 text-xs text-gray-100">
                            {JSON.stringify(cap.output_schema, null, 2)}
                          </pre>
                        </details>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Playground */}
          <Playground agentId={agent.id} />

          <Separator />

          {/* Code Examples */}
          <div>
            <h2 className="mb-4 text-lg font-semibold">调用示例</h2>
            <Tabs defaultValue="curl">
              <TabsList>
                <TabsTrigger value="curl">cURL</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
                <TabsTrigger value="javascript">JavaScript</TabsTrigger>
              </TabsList>
              <TabsContent value="curl">
                <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100">
                  {curlExample}
                </pre>
              </TabsContent>
              <TabsContent value="python">
                <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100">
                  {pythonExample}
                </pre>
              </TabsContent>
              <TabsContent value="javascript">
                <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 text-sm text-gray-100">
                  {jsExample}
                </pre>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-600">
                  ¥{agent.pricing_per_million_tokens}
                </p>
                <p className="mt-1 text-sm text-gray-400">/ 百万 tokens</p>
              </div>
              <Button
                className="mt-6 w-full"
                onClick={() => {
                  if (!user) {
                    router.push(`/login?redirect=/agents/${agent.id}`);
                  } else {
                    router.push("/console/keys");
                  }
                }}
              >
                开始使用
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">总调用次数</span>
                <span className="font-medium">{agent.total_calls}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">平均响应时间</span>
                <span className="font-medium">
                  {agent.avg_response_time_ms > 0 ? `${agent.avg_response_time_ms}ms` : "-"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">分类</span>
                <Badge variant="secondary">{agent.category || "其他"}</Badge>
              </div>
              <Separator />
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">创建时间</span>
                <span>{new Date(agent.created_at).toLocaleDateString("zh-CN")}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">更新时间</span>
                <span>{new Date(agent.updated_at).toLocaleDateString("zh-CN")}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
