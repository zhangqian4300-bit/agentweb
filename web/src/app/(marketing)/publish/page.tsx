"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import type { AgentCard, Capability } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

const CATEGORIES = ["文献与知识", "数据与计算", "生命科学", "化学与材料", "物理与工程", "地球与环境", "数学与AI", "写作与协作", "其他"];

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "文献与知识": ["文献", "论文", "综述", "review", "paper", "literature", "citation", "知识图谱", "knowledge", "search", "retrieval", "pubmed", "arxiv"],
  "数据与计算": ["数据", "计算", "统计", "分析", "可视化", "data", "compute", "analysis", "statistics", "visualization", "hpc", "pipeline", "workflow"],
  "生命科学": ["蛋白质", "基因", "生物", "药物", "细胞", "protein", "gene", "bio", "drug", "cell", "genomics", "alphafold", "sequence", "docking"],
  "化学与材料": ["化学", "材料", "合成", "催化", "chemistry", "material", "molecule", "synthesis", "catalyst", "polymer", "crystal"],
  "物理与工程": ["物理", "仿真", "模拟", "信号", "力学", "physics", "simulation", "fem", "cfd", "signal", "mechanics", "quantum", "optics"],
  "地球与环境": ["气象", "气候", "遥感", "地质", "环境", "ocean", "climate", "remote sensing", "gis", "ecology", "weather", "earth"],
  "数学与AI": ["数学", "公式", "模型", "机器学习", "math", "formula", "model", "ml", "deep learning", "optimization", "neural"],
  "写作与协作": ["写作", "润色", "论文写作", "审稿", "基金", "writing", "polish", "manuscript", "review response", "grant", "abstract", "报告"],
};

function suggestCategory(text: string): string {
  const lower = text.toLowerCase();
  let best = "其他";
  let bestScore = 0;
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }
  return best;
}

export default function PublishPage() {
  const router = useRouter();
  const { user, login, register } = useAuth();

  const [endpointUrl, setEndpointUrl] = useState("");
  const [endpointApiKey, setEndpointApiKey] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");

  const [fetched, setFetched] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [category, setCategory] = useState("");
  const [pricing, setPricing] = useState("10");

  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const [publishing, setPublishing] = useState(false);

  const handleFetch = useCallback(async () => {
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
      const text = `${card.name || ""} ${card.description || ""}`;
      setCategory(suggestCategory(text));
      setFetched(true);
    } catch (err) {
      setFetchError(
        err instanceof ApiError
          ? err.detail
          : "无法连接，请检查 URL 是否正确、Agent 是否在线"
      );
    } finally {
      setFetching(false);
    }
  }, [endpointUrl, endpointApiKey]);

  async function handleAuth() {
    setAuthLoading(true);
    setAuthError("");
    try {
      if (authMode === "register") {
        await register(authEmail, authPassword, authName || undefined);
        await login(authEmail, authPassword);
      } else {
        await login(authEmail, authPassword);
      }
      setShowAuth(false);
      toast.success("登录成功");
    } catch (err) {
      setAuthError(err instanceof ApiError ? err.detail : "操作失败");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handlePublish() {
    if (!user) {
      setShowAuth(true);
      return;
    }
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
      toast.success("Agent 已上架！");
      router.push("/console/agents");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "发布失败");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold">上架你的 Agent</h1>
        <p className="mt-2 text-gray-500">
          粘贴端点 URL，平台自动获取信息，一键发布到市场
        </p>
      </div>

      {/* URL Input */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label>Agent 端点 URL</Label>
            <div className="flex gap-2">
              <Input
                placeholder="https://your-agent.example.com"
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleFetch();
                }}
              />
              <Button onClick={handleFetch} disabled={!endpointUrl || fetching}>
                {fetching ? "获取中..." : "获取信息"}
              </Button>
            </div>
          </div>
          <details>
            <summary className="cursor-pointer text-xs text-gray-400">
              端点需要认证？
            </summary>
            <div className="mt-2">
              <Input
                type="password"
                placeholder="Agent 端点的 API Key（可选）"
                value={endpointApiKey}
                onChange={(e) => setEndpointApiKey(e.target.value)}
              />
            </div>
          </details>
          {fetchError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{fetchError}</div>
          )}
        </CardContent>
      </Card>

      {/* Agent Info (shown after fetch) */}
      {fetched && (
        <div className="mt-6 space-y-6">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label>名称</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>描述</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              {capabilities.length > 0 && (
                <div className="space-y-2">
                  <Label>能力</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {capabilities.map((c, i) => (
                      <Badge key={i} variant="secondary">{c.name}</Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>分类</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v ?? "")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>定价（¥ / 百万 tokens）</Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={pricing}
                    onChange={(e) => setPricing(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Inline Auth (if not logged in) */}
          {showAuth && !user && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex gap-2 text-sm">
                  <button
                    className={authMode === "register" ? "font-medium text-blue-600" : "text-gray-400"}
                    onClick={() => setAuthMode("register")}
                  >
                    注册
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    className={authMode === "login" ? "font-medium text-blue-600" : "text-gray-400"}
                    onClick={() => setAuthMode("login")}
                  >
                    登录
                  </button>
                </div>
                {authMode === "register" && (
                  <div className="space-y-2">
                    <Input
                      placeholder="昵称（可选）"
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Input
                    type="email"
                    placeholder="邮箱"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Input
                    type="password"
                    placeholder="密码（至少 8 位）"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                  />
                </div>
                {authError && (
                  <p className="text-sm text-red-500">{authError}</p>
                )}
                <Button onClick={handleAuth} disabled={authLoading || !authEmail || !authPassword} className="w-full">
                  {authLoading ? "处理中..." : authMode === "register" ? "注册并发布" : "登录并发布"}
                </Button>
              </CardContent>
            </Card>
          )}

          <Button
            onClick={handlePublish}
            disabled={publishing || !name || !pricing}
            className="w-full h-12 text-base"
          >
            {publishing ? "发布中..." : user ? "发布到市场" : "登录后发布"}
          </Button>

          {!user && !showAuth && (
            <p className="text-center text-sm text-gray-400">
              已有账号？点击发布后可直接登录
            </p>
          )}
        </div>
      )}
    </div>
  );
}
