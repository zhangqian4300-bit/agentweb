"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { Agent, AgentCard, Capability } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const CATEGORIES = ["文献与知识", "数据与计算", "生命科学", "化学与材料", "物理与工程", "地球与环境", "数学与AI", "写作与协作", "其他"];

export default function EditAgentPage() {
  const params = useParams();
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("");
  const [category, setCategory] = useState("");
  const [pricing, setPricing] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [endpointApiKey, setEndpointApiKey] = useState("");
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [loading, setLoading] = useState(false);
  const [refetching, setRefetching] = useState(false);

  useEffect(() => {
    if (!params.id) return;
    api<Agent>(`/api/v1/agents/${params.id}`).then((a) => {
      setAgent(a);
      setName(a.name);
      setDescription(a.description || "");
      setVersion(a.version);
      setCategory(a.category || "");
      setPricing(String(a.pricing_per_million_tokens));
      setEndpointUrl(a.endpoint_url || "");
      setCapabilities(a.capabilities || []);
    });
  }, [params.id]);

  async function handleRefetch() {
    if (!endpointUrl) {
      toast.error("请先填写 Agent 端点 URL");
      return;
    }
    setRefetching(true);
    try {
      const card = await api<AgentCard>("/api/v1/agents/fetch-card", {
        method: "POST",
        body: { endpoint_url: endpointUrl, endpoint_api_key: endpointApiKey || undefined },
      });
      if (card.name) setName(card.name);
      if (card.description) setDescription(card.description);
      if (card.version) setVersion(card.version);
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
      toast.success("已更新 Agent 信息");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.detail : "无法获取 Agent Card"
      );
    } finally {
      setRefetching(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agent) return;
    setLoading(true);
    try {
      await api(`/api/v1/agents/${agent.id}`, {
        method: "PATCH",
        body: {
          name,
          description: description || undefined,
          version,
          category: category || undefined,
          pricing_per_million_tokens: Number(pricing),
          endpoint_url: endpointUrl || undefined,
          endpoint_api_key: endpointApiKey || undefined,
          capabilities: capabilities.map((c) => ({
            name: c.name,
            description: c.description,
            input_schema: c.input_schema || undefined,
            output_schema: c.output_schema || undefined,
          })),
        },
      });
      toast.success("更新成功");
      router.push("/console/agents");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "更新失败");
    } finally {
      setLoading(false);
    }
  }

  if (!agent) {
    return <div className="h-48 animate-pulse rounded-lg bg-gray-200" />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">编辑 Agent</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Endpoint + Re-fetch */}
        <Card>
          <CardHeader>
            <CardTitle>Agent 端点</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>端点 URL</Label>
              <div className="flex gap-2">
                <Input
                  className="flex-1"
                  placeholder="https://your-agent.example.com"
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRefetch}
                  disabled={refetching || !endpointUrl}
                >
                  {refetching ? "拉取中..." : "重新拉取"}
                </Button>
              </div>
              <p className="text-xs text-gray-400">
                从 Agent 端点重新获取最新信息并刷新表单
              </p>
            </div>
            <div className="space-y-2">
              <Label>端点 API Key（可选）</Label>
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>基本信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>名称</Label>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>版本</Label>
                <Input
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>分类</Label>
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
            </div>
            <div className="space-y-2">
              <Label>定价（¥ / 百万 tokens）</Label>
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

        {/* Capabilities */}
        {capabilities.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>能力列表</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {capabilities.map((cap, idx) => (
                <div key={idx} className="rounded-lg border p-4">
                  <span className="font-medium">{cap.name}</span>
                  <p className="mt-1 text-sm text-gray-500">
                    {cap.description}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? "保存中..." : "保存修改"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            取消
          </Button>
        </div>
      </form>
    </div>
  );
}
