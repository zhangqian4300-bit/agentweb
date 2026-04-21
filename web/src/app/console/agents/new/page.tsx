"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { APIKey, AgentCard, Capability } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const CATEGORIES = ["法律", "医疗", "代码", "数据", "翻译", "写作", "教育", "其他"];

export default function CreateAgentPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Step 1
  const [endpointUrl, setEndpointUrl] = useState("");
  const [agentKeys, setAgentKeys] = useState<APIKey[]>([]);
  const [selectedKeyId, setSelectedKeyId] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");

  const [endpointApiKey, setEndpointApiKey] = useState("");

  // Step 2
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [category, setCategory] = useState("");
  const [pricing, setPricing] = useState("");

  // Step 3
  const [publishing, setPublishing] = useState(false);

  const fetchAgentKeys = useCallback(async () => {
    try {
      const data = await api<APIKey[]>("/api/v1/keys");
      setAgentKeys(data.filter((k) => k.key_type === "agent_key"));
    } catch {
      setAgentKeys([]);
    }
  }, []);

  useEffect(() => {
    fetchAgentKeys();
  }, [fetchAgentKeys]);

  async function handleFetchCard() {
    if (!endpointUrl) return;
    setFetching(true);
    setFetchError("");
    try {
      const card = await api<AgentCard>("/api/v1/agents/fetch-card", {
        method: "POST",
        body: { endpoint_url: endpointUrl, endpoint_api_key: endpointApiKey || undefined },
      });
      setName(card.name || "");
      setDescription(card.description || "");
      setVersion(card.version || "1.0.0");
      if (Array.isArray(card.capabilities)) {
        setCapabilities(
          card.capabilities.map((c) => ({
            name: c.name || "",
            description: c.description || "",
            input_schema: c.input_schema,
            output_schema: c.output_schema,
          }))
        );
      }
      setStep(2);
    } catch (err) {
      setFetchError(
        err instanceof ApiError
          ? err.detail
          : "无法连接到该地址，请检查 URL 和 Agent 是否在线"
      );
    } finally {
      setFetching(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      await api("/api/v1/agents", {
        method: "POST",
        body: {
          name,
          description: description || undefined,
          version,
          category: category || undefined,
          pricing_per_million_tokens: Number(pricing),
          capabilities: capabilities.map((c) => ({
            name: c.name,
            description: c.description,
            input_schema: c.input_schema || undefined,
            output_schema: c.output_schema || undefined,
          })),
          endpoint_url: endpointUrl || undefined,
          endpoint_api_key: endpointApiKey || undefined,
        },
      });
      toast.success("Agent 已上架，连接 WebSocket 后即可接收调用");
      router.push("/console/agents");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "发布失败");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">创建新 Agent</h1>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                s === step
                  ? "bg-blue-600 text-white"
                  : s < step
                    ? "bg-blue-100 text-blue-600"
                    : "bg-gray-100 text-gray-400"
              }`}
            >
              {s < step ? "✓" : s}
            </div>
            <span
              className={`text-sm ${s === step ? "font-medium text-gray-900" : "text-gray-400"}`}
            >
              {s === 1 ? "连接 Agent" : s === 2 ? "确认信息" : "发布"}
            </span>
            {s < 3 && <div className="mx-2 h-px w-8 bg-gray-200" />}
          </div>
        ))}
      </div>

      {/* Step 1: Connect Agent */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>连接你的 Agent</CardTitle>
            <p className="text-sm text-gray-500">
              输入 Agent 的端点地址，平台将自动拉取 Agent 信息
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Agent 端点 URL</Label>
              <Input
                placeholder="https://your-agent.example.com"
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Agent 端点 API Key（可选）</Label>
              <Input
                type="password"
                placeholder="Agent 服务的认证密钥"
                value={endpointApiKey}
                onChange={(e) => setEndpointApiKey(e.target.value)}
              />
              <p className="text-xs text-gray-400">
                如果你的 Agent 需要 API Key 认证，在此填写
              </p>
            </div>
            <div className="space-y-2">
              <Label>Agent Key</Label>
              {agentKeys.length === 0 ? (
                <div className="rounded-lg border-2 border-dashed p-4 text-center text-sm text-gray-400">
                  <p>还没有 Agent Key</p>
                  <Button
                    variant="link"
                    className="mt-1 h-auto p-0 text-blue-600"
                    onClick={() => router.push("/console/keys")}
                  >
                    先去创建一个 Agent Key
                  </Button>
                </div>
              ) : (
                <Select
                  value={selectedKeyId}
                  onValueChange={(v) => setSelectedKeyId(v ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择 Agent Key" />
                  </SelectTrigger>
                  <SelectContent>
                    {agentKeys.map((k) => (
                      <SelectItem key={k.id} value={k.id}>
                        {k.name || k.key_prefix + "..."}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {fetchError && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                {fetchError}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={handleFetchCard}
                disabled={!endpointUrl || fetching}
              >
                {fetching ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    正在获取 Agent 信息...
                  </span>
                ) : (
                  "拉取信息"
                )}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setStep(2);
                }}
              >
                跳过，手动填写
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Confirm Info */}
      {step === 2 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Agent 信息</CardTitle>
              <p className="text-sm text-gray-500">
                以下信息已从 Agent Card 自动填充，你可以编辑修改
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>名称 *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>描述</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>版本</Label>
                <Input
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Capabilities from agent card */}
          {capabilities.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>能力列表</CardTitle>
                <p className="text-sm text-gray-500">
                  从 Agent Card 中获取的能力
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {capabilities.map((cap, idx) => (
                  <div key={idx} className="rounded-lg border p-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{cap.name}</span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      {cap.description}
                    </p>
                    {cap.input_schema && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-gray-400">
                          输入 Schema
                        </summary>
                        <pre className="mt-1 overflow-x-auto rounded bg-gray-900 p-3 text-xs text-gray-100">
                          {JSON.stringify(cap.input_schema, null, 2)}
                        </pre>
                      </details>
                    )}
                    {cap.output_schema && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-gray-400">
                          输出 Schema
                        </summary>
                        <pre className="mt-1 overflow-x-auto rounded bg-gray-900 p-3 text-xs text-gray-100">
                          {JSON.stringify(cap.output_schema, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>平台信息</CardTitle>
              <p className="text-sm text-gray-500">
                以下字段需要手动填写
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>分类 *</Label>
                <Select
                  value={category}
                  onValueChange={(v) => setCategory(v ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择分类" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>定价（¥ / 百万 tokens）*</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={pricing}
                  onChange={(e) => setPricing(e.target.value)}
                  required
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)}>
              上一步
            </Button>
            <Button
              onClick={() => setStep(3)}
              disabled={!name || !pricing}
            >
              下一步
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Preview & Publish */}
      {step === 3 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>发布预览</CardTitle>
              <p className="text-sm text-gray-500">
                确认以下信息无误后，点击发布到市场
              </p>
            </CardHeader>
            <CardContent>
              {/* Simulated marketplace card */}
              <div className="rounded-lg border p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold">{name}</h3>
                    <p className="text-sm text-gray-400">v{version}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                    <span className="h-2 w-2 rounded-full bg-gray-300" />
                    离线
                  </span>
                </div>
                <p className="text-sm text-gray-500">
                  {description || "暂无描述"}
                </p>
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">{category || "未分类"}</Badge>
                  <span className="text-sm font-medium text-blue-600">
                    ¥{pricing || "0"}/M tokens
                  </span>
                </div>
                {capabilities.length > 0 && (
                  <div className="border-t pt-3">
                    <p className="text-xs text-gray-400 mb-2">
                      {capabilities.length} 个能力
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {capabilities.map((c, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {c.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {endpointUrl && (
                  <div className="border-t pt-3">
                    <p className="text-xs text-gray-400">端点</p>
                    <p className="font-mono text-xs text-gray-600 mt-1">
                      {endpointUrl}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(2)}>
              上一步
            </Button>
            <Button onClick={handlePublish} disabled={publishing}>
              {publishing ? "发布中..." : "发布到市场"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => router.back()}
            >
              取消
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
