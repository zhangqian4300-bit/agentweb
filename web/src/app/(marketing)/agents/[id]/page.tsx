"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
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
import { Textarea } from "@/components/ui/textarea";
import { Copy } from "lucide-react";
import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const WS_BASE = API_BASE.replace(/^http/, "ws");

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

function Playground({ agentId }: { agentId: string }) {
  const { user } = useAuth();
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const currentAssistant = useRef("");

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    setConnecting(false);
  }, []);

  const connect = useCallback(() => {
    if (!apiKey) return;
    disconnect();
    setConnecting(true);
    setError("");

    const ws = new WebSocket(`${WS_BASE}/ws/chat?api_key=${encodeURIComponent(apiKey)}`);
    wsRef.current = ws;

    ws.onopen = () => {};

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const type = data.type;

      if (type === "connected") {
        setConnected(true);
        setConnecting(false);
        setError("");
        return;
      }

      if (type === "stream_chunk") {
        currentAssistant.current += data.content || "";
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant" && last.streaming) {
            updated[updated.length - 1] = { ...last, content: currentAssistant.current };
          }
          return updated;
        });
        scrollToBottom();
        return;
      }

      if (type === "stream_end") {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant") {
            updated[updated.length - 1] = { ...last, streaming: false };
          }
          return updated;
        });
        setSending(false);
        currentAssistant.current = "";
        return;
      }

      if (type === "response") {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant") {
            updated[updated.length - 1] = { role: "assistant", content: data.content || "" };
          }
          return updated;
        });
        setSending(false);
        scrollToBottom();
        return;
      }

      if (type === "error") {
        setError(data.detail || "调用出错");
        setSending(false);
        return;
      }

      if (type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setConnecting(false);
      setSending(false);
      reconnectTimer.current = setTimeout(() => {
        if (wsRef.current === ws && apiKey) {
          connect();
        }
      }, 3000);
    };

    ws.onerror = () => {
      setError("WebSocket 连接失败");
    };
  }, [apiKey, disconnect, scrollToBottom]);

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  const handleSend = useCallback(() => {
    if (!message.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setSending(true);
    setError("");

    const userMsg: ChatMessage = { role: "user", content: message.trim() };
    const assistantMsg: ChatMessage = { role: "assistant", content: "", streaming: true };
    currentAssistant.current = "";
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    wsRef.current.send(
      JSON.stringify({
        type: "chat",
        agent_id: agentId,
        message: message.trim(),
        stream: true,
      })
    );
    setMessage("");
    setTimeout(scrollToBottom, 50);
  }, [agentId, message, scrollToBottom]);

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
        <CardTitle className="flex items-center justify-between text-lg">
          <span>在线试用</span>
          {connected && (
            <span className="flex items-center gap-1.5 text-xs font-normal text-green-600">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              已连接
            </span>
          )}
          {connecting && (
            <span className="text-xs font-normal text-yellow-600">连接中...</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!connected && (
          <div className="space-y-3">
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
            <Button onClick={connect} disabled={!apiKey || connecting} className="w-full">
              {connecting ? "连接中..." : "连接"}
            </Button>
          </div>
        )}

        {connected && (
          <>
            <div
              ref={scrollRef}
              className="flex h-80 flex-col gap-3 overflow-y-auto rounded-lg border bg-gray-50 p-4"
            >
              {messages.length === 0 && (
                <p className="m-auto text-sm text-gray-400">发送消息开始对话</p>
              )}
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-white text-gray-800 shadow-sm"
                    }`}
                  >
                    {msg.content || (msg.streaming ? "..." : "(空响应)")}
                    {msg.streaming && (
                      <span className="ml-1 inline-block h-3 w-1.5 animate-pulse rounded-sm bg-gray-400" />
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Textarea
                placeholder="输入消息... (Ctrl+Enter 发送)"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                className="flex-1 resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <div className="flex flex-col gap-2">
                <Button
                  onClick={handleSend}
                  disabled={sending || !message.trim()}
                  className="h-full"
                >
                  {sending ? "..." : "发送"}
                </Button>
              </div>
            </div>

            <div className="flex justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMessages([]);
                  wsRef.current?.send(JSON.stringify({ type: "clear_history" }));
                }}
                className="text-xs text-gray-400"
              >
                清空对话
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={disconnect}
                className="text-xs text-gray-400"
              >
                断开连接
              </Button>
            </div>
          </>
        )}

        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>
        )}
      </CardContent>
    </Card>
  );
}

function QuickConnect({ agent }: { agent: Agent }) {
  const { user } = useAuth();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [tab, setTab] = useState<"env" | "python" | "curl">("env");
  const exampleBaseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:8000";
  // 部署时设置环境变量 NEXT_PUBLIC_SITE_URL 为实际域名，如 https://agentweb.example.com

  useEffect(() => {
    if (!user) return;
    api<{ key: string }>("/api/v1/keys/default")
      .then((data) => setApiKey(data.key))
      .catch(() => setApiKey(null));
  }, [user]);

  const keyDisplay = apiKey || "{your_api_key}";

  const configs: Record<string, string> = {
    env: [
      `OPENAI_BASE_URL=${exampleBaseUrl}/v1`,
      `OPENAI_API_KEY=${keyDisplay}`,
      `OPENAI_MODEL=${agent.name}`,
    ].join("\n"),
    python: [
      `from openai import OpenAI`,
      ``,
      `client = OpenAI(`,
      `    base_url="${exampleBaseUrl}/v1",`,
      `    api_key="${keyDisplay}",`,
      `)`,
      `resp = client.chat.completions.create(`,
      `    model="${agent.name}",`,
      `    messages=[{"role": "user", "content": "你好"}],`,
      `)`,
      `print(resp.choices[0].message.content)`,
    ].join("\n"),
    curl: [
      `curl ${exampleBaseUrl}/v1/chat/completions \\`,
      `  -H "Authorization: Bearer ${keyDisplay}" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '{"model":"${agent.name}","messages":[{"role":"user","content":"你好"}]}'`,
    ].join("\n"),
  };

  return (
    <Card>
      <CardContent className="pt-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">快速接入</span>
          <button
            className="text-gray-400 hover:text-gray-600"
            onClick={() => {
              navigator.clipboard.writeText(configs[tab]);
              toast.success("已复制");
            }}
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-1 rounded-md bg-gray-100 p-0.5">
          {([["env", ".env"], ["python", "Python"], ["curl", "cURL"]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 rounded px-2 py-1 text-xs transition-colors ${
                tab === key ? "bg-white font-medium text-gray-900 shadow-sm" : "text-gray-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <pre className="overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs leading-relaxed text-gray-100">
          {configs[tab]}
        </pre>
        {!user && (
          <p className="text-xs text-gray-400">
            <Link href={`/login?redirect=/agents/${agent.id}`} className="text-blue-600 hover:underline">
              登录
            </Link>
            {" "}后自动填充你的 API Key
          </p>
        )}
        {user && apiKey && (
          <p className="text-xs text-green-600">API Key 已自动填充，复制即可使用</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function AgentDetailPage() {
  const params = useParams();
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
            </CardContent>
          </Card>

          <QuickConnect agent={agent} />

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
