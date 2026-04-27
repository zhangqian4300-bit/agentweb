"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import type { AgentCard, Capability } from "@/lib/types";
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

const GRADE_COLORS: Record<string, string> = {
  A: "bg-green-100 text-green-700 border-green-300",
  B: "bg-blue-100 text-blue-700 border-blue-300",
  C: "bg-yellow-100 text-yellow-700 border-yellow-300",
  D: "bg-red-100 text-red-700 border-red-300",
};

interface TestCase {
  input: string;
  expected: string;
  capability: string;
}

interface TestResult {
  grade: string;
  response_content: string;
  response_time_ms: number;
  evaluation: string;
}

interface PricingSuggestion {
  suggested_low: number;
  suggested_high: number;
  category_avg: number;
  similar_count: number;
  scarcity: string;
  reasoning: string;
}

type ConnectMode = "sdk" | "endpoint";

export default function PublishPage() {
  const router = useRouter();
  const { user, login, register } = useAuth();

  const [step, setStep] = useState(1);
  const [connectMode, setConnectMode] = useState<ConnectMode>("sdk");

  // Step 1: Connect (endpoint mode)
  const [endpointUrl, setEndpointUrl] = useState("");
  const [endpointApiKey, setEndpointApiKey] = useState("");
  const [endpointProtocol, setEndpointProtocol] = useState<"openai" | "a2a">("openai");
  const [showApiKey, setShowApiKey] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");

  // Step 1: Connect (SDK mode)
  const [sdkSnippet, setSdkSnippet] = useState("");
  const [sdkAgentKey, setSdkAgentKey] = useState("");
  const [sdkLoading, setSdkLoading] = useState(false);
  const [sdkCopied, setSdkCopied] = useState(false);
  const [waitingAgent, setWaitingAgent] = useState(false);
  const [pollTimer, setPollTimer] = useState<ReturnType<typeof setInterval> | null>(null);

  // Agent info
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [category, setCategory] = useState("");

  // Step 2: Test cases
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [probing, setProbing] = useState(false);

  // Step 3: Test results
  const [testResults, setTestResults] = useState<(TestResult | null)[]>([]);
  const [testingIndex, setTestingIndex] = useState(-1);
  const [testingDone, setTestingDone] = useState(false);

  // Step 4: Pricing
  const [pricing, setPricing] = useState("10");
  const [pricingSuggestion, setPricingSuggestion] = useState<PricingSuggestion | null>(null);
  const [loadingPricing, setLoadingPricing] = useState(false);

  // Auth
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const [publishing, setPublishing] = useState(false);

  // SDK mode: generate snippet
  const handleGenerateSDK = useCallback(async () => {
    if (!user) {
      setShowAuth(true);
      return;
    }
    setSdkLoading(true);
    try {
      const result = await api<{ snippet: string; agent_key: string; platform_url: string }>("/api/v1/agent-hub/sdk-snippet");
      setSdkSnippet(result.snippet);
      setSdkAgentKey(result.agent_key);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "生成失败");
    } finally {
      setSdkLoading(false);
    }
  }, [user]);

  const handleCopySnippet = useCallback(() => {
    navigator.clipboard.writeText(sdkSnippet);
    setSdkCopied(true);
    toast.success("已复制到剪贴板");
    setTimeout(() => setSdkCopied(false), 2000);
  }, [sdkSnippet]);

  const startWaitingAgent = useCallback(() => {
    setWaitingAgent(true);
    const timer = setInterval(async () => {
      try {
        const status = await api<{
          status: string;
          agent_id?: string;
          name?: string;
          description?: string;
          category?: string;
          pricing?: number;
          capabilities?: { name: string; description: string }[];
        }>("/api/v1/agent-hub/status");
        if (status.status === "pending_review" && status.name) {
          clearInterval(timer);
          setPollTimer(null);
          setWaitingAgent(false);
          setName(status.name);
          setDescription(status.description || "");
          setCategory(status.category || "其他");
          if (status.pricing) setPricing(String(status.pricing));
          if (status.capabilities) {
            setCapabilities(
              status.capabilities.map((c) => ({
                name: c.name,
                description: c.description,
              }))
            );
          }
          setStep(4);
          toast.success("Agent 已连接，请确认信息并上架");
        }
      } catch {
        // keep polling
      }
    }, 3000);
    setPollTimer(timer);
  }, [sdkAgentKey]);

  useEffect(() => {
    return () => {
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [pollTimer]);

  // Step 1: Fetch agent card
  const handleFetch = useCallback(async () => {
    if (!endpointUrl) return;
    setFetching(true);
    setFetchError("");
    try {
      const card = await api<AgentCard>("/api/v1/agents/fetch-card", {
        method: "POST",
        body: { endpoint_url: endpointUrl, endpoint_api_key: endpointApiKey || undefined, endpoint_protocol: endpointProtocol },
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
      setStep(2);
      handleProbe();
    } catch (err) {
      const msg = err instanceof ApiError
        ? err.detail
        : "无法连接，请检查 URL 是否正确、Agent 是否在线";
      setFetchError(msg);
      if (msg.includes("认证") || msg.includes("API Key")) {
        setShowApiKey(true);
      }
    } finally {
      setFetching(false);
    }
  }, [endpointUrl, endpointApiKey, endpointProtocol]);

  // Step 2: Probe for test cases
  const handleProbe = useCallback(async () => {
    setProbing(true);
    try {
      const result = await api<{ test_cases: TestCase[] }>("/api/v1/agents/probe", {
        method: "POST",
        body: { endpoint_url: endpointUrl, endpoint_api_key: endpointApiKey || undefined, endpoint_protocol: endpointProtocol },
      });
      setTestCases(result.test_cases || []);
    } catch {
      setTestCases([
        { input: "你好，请介绍一下你自己", expected: "Agent 应该给出自我介绍", capability: "基础对话" },
      ]);
    } finally {
      setProbing(false);
    }
  }, [endpointUrl, endpointApiKey, endpointProtocol]);

  const addTestCase = () => {
    setTestCases([...testCases, { input: "", expected: "", capability: "" }]);
  };

  const removeTestCase = (index: number) => {
    setTestCases(testCases.filter((_, i) => i !== index));
  };

  const updateTestCase = (index: number, field: keyof TestCase, value: string) => {
    const updated = [...testCases];
    updated[index] = { ...updated[index], [field]: value };
    setTestCases(updated);
  };

  // Step 3: Run tests sequentially
  const handleStartTests = useCallback(async () => {
    setStep(3);
    setTestResults(new Array(testCases.length).fill(null));
    setTestingDone(false);

    for (let i = 0; i < testCases.length; i++) {
      setTestingIndex(i);
      try {
        const result = await api<TestResult>("/api/v1/agents/run-test", {
          method: "POST",
          body: {
            endpoint_url: endpointUrl,
            endpoint_api_key: endpointApiKey || undefined,
            endpoint_protocol: endpointProtocol,
            test_input: testCases[i].input,
            expected: testCases[i].expected,
          },
        });
        setTestResults((prev) => {
          const updated = [...prev];
          updated[i] = result;
          return updated;
        });
      } catch {
        setTestResults((prev) => {
          const updated = [...prev];
          updated[i] = {
            grade: "D",
            response_content: "",
            response_time_ms: 0,
            evaluation: "测试请求失败",
          };
          return updated;
        });
      }
    }

    setTestingIndex(-1);
    setTestingDone(true);
  }, [testCases, endpointUrl, endpointApiKey, endpointProtocol]);

  // Step 4: Get pricing suggestion
  const handleGetPricing = useCallback(async () => {
    setStep(4);
    setLoadingPricing(true);
    try {
      const grades = testResults
        .filter((r): r is TestResult => r !== null)
        .map((r) => r.grade);
      const result = await api<PricingSuggestion>("/api/v1/agents/suggest-pricing", {
        method: "POST",
        body: { category: category || "其他", grades },
      });
      setPricingSuggestion(result);
      const mid = ((result.suggested_low + result.suggested_high) / 2).toFixed(1);
      setPricing(mid);
    } catch {
      setPricingSuggestion(null);
    } finally {
      setLoadingPricing(false);
    }
  }, [testResults, category]);

  // Auth
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

  // Publish
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
          endpoint_protocol: endpointUrl ? endpointProtocol : undefined,
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

  const completedTests = testResults.filter((r) => r !== null).length;
  const avgGrade = (() => {
    const grades = testResults.filter((r): r is TestResult => r !== null);
    if (grades.length === 0) return "-";
    const scores = { A: 4, B: 3, C: 2, D: 1 };
    const avg = grades.reduce((s, r) => s + (scores[r.grade as keyof typeof scores] || 1), 0) / grades.length;
    if (avg >= 3.5) return "A";
    if (avg >= 2.8) return "B+";
    if (avg >= 2.3) return "B";
    if (avg >= 1.8) return "C+";
    if (avg >= 1.3) return "C";
    return "D";
  })();

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold">上架你的 Agent</h1>
        <p className="mt-2 text-gray-500">
          {connectMode === "sdk"
            ? "安装 SDK → 运行连接 → 自动注册 → 确认上架"
            : "粘贴端点 URL → 能力探测 → 质量测试 → 智能定价"}
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8 flex items-center justify-between">
        {(connectMode === "sdk"
          ? [
              { n: 1, label: "连接" },
              { n: 4, label: "确认上架" },
            ]
          : [
              { n: 1, label: "连接" },
              { n: 2, label: "探测" },
              { n: 3, label: "测试" },
              { n: 4, label: "定价发布" },
            ]
        ).map(({ n, label }, idx, arr) => (
          <div key={n} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                step >= n
                  ? "bg-teal-600 text-white"
                  : "bg-gray-200 text-gray-400"
              }`}
            >
              {step > n ? "✓" : idx + 1}
            </div>
            <span className={`text-sm ${step >= n ? "text-gray-900" : "text-gray-400"}`}>
              {label}
            </span>
            {idx < arr.length - 1 && <div className={`mx-2 h-px w-8 ${step > n ? "bg-teal-600" : "bg-gray-200"}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Connect */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Mode Switcher */}
          <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
            <button
              onClick={() => setConnectMode("sdk")}
              className={`flex-1 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
                connectMode === "sdk"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              SDK 接入（推荐）
            </button>
            <button
              onClick={() => setConnectMode("endpoint")}
              className={`flex-1 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
                connectMode === "endpoint"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              端点 URL 接入
            </button>
          </div>

          {/* SDK Mode */}
          {connectMode === "sdk" && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                {!sdkSnippet ? (
                  <>
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-600 mb-1">
                        安装 SDK，一行代码连接平台
                      </p>
                      <p className="text-xs text-gray-400">
                        生成专属 agent_key 和接入代码，运行后 Agent 自动连接并完成注册
                      </p>
                    </div>
                    <Button
                      onClick={handleGenerateSDK}
                      disabled={sdkLoading}
                      className="w-full h-12 text-base"
                    >
                      {sdkLoading ? "生成中..." : "生成 SDK 接入代码"}
                    </Button>
                  </>
                ) : !waitingAgent ? (
                  <>
                    <div className="space-y-2">
                      <Label>接入代码</Label>
                      <div className="relative">
                        <pre className="whitespace-pre-wrap rounded-lg bg-gray-50 border p-4 text-xs text-gray-700 max-h-64 overflow-y-auto font-mono">
                          {sdkSnippet}
                        </pre>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleCopySnippet}
                        variant="outline"
                        className="flex-1"
                      >
                        {sdkCopied ? "已复制" : "复制代码"}
                      </Button>
                      <Button
                        onClick={startWaitingAgent}
                        className="flex-1"
                      >
                        我已运行 SDK
                      </Button>
                    </div>
                    <p className="text-xs text-gray-400 text-center">
                      复制代码到你的项目中运行，Agent 会自动连接平台
                    </p>
                  </>
                ) : (
                  <div className="flex flex-col items-center py-8">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
                    <p className="mt-4 text-sm text-gray-600">等待 Agent 连接...</p>
                    <p className="mt-1 text-xs text-gray-400">
                      Agent 连接后会自动完成自我介绍和注册
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Endpoint Mode */}
          {connectMode === "endpoint" && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                {/* Protocol Selector */}
                <div className="space-y-2">
                  <Label>端点协议</Label>
                  <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
                    <button
                      onClick={() => setEndpointProtocol("openai")}
                      className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        endpointProtocol === "openai"
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      OpenAI 兼容
                    </button>
                    <button
                      onClick={() => setEndpointProtocol("a2a")}
                      className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        endpointProtocol === "a2a"
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      A2A 协议
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Agent 端点 URL</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder={endpointProtocol === "a2a" ? "https://your-agent.example.com/a2a/rpc" : "https://your-agent.example.com"}
                      value={endpointUrl}
                      onChange={(e) => setEndpointUrl(e.target.value)}
                      className="flex-1"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleFetch();
                      }}
                    />
                    <Button onClick={handleFetch} disabled={!endpointUrl || fetching}>
                      {fetching ? "连接中..." : "连接并探测"}
                    </Button>
                  </div>
                </div>
                {!showApiKey ? (
                  <button
                    className="text-xs text-gray-400 hover:text-gray-600"
                    onClick={() => setShowApiKey(true)}
                  >
                    端点需要认证？
                  </button>
                ) : (
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">端点 API Key</Label>
                    <Input
                      type="password"
                      placeholder="Agent 端点的 API Key"
                      value={endpointApiKey}
                      onChange={(e) => setEndpointApiKey(e.target.value)}
                    />
                  </div>
                )}
                {fetchError && (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{fetchError}</div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Auth (for SDK mode, need login first) */}
          {connectMode === "sdk" && showAuth && !user && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex gap-2 text-sm">
                  <button
                    className={authMode === "register" ? "font-medium text-teal-600" : "text-gray-400"}
                    onClick={() => setAuthMode("register")}
                  >
                    注册
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    className={authMode === "login" ? "font-medium text-teal-600" : "text-gray-400"}
                    onClick={() => setAuthMode("login")}
                  >
                    登录
                  </button>
                </div>
                {authMode === "register" && (
                  <Input
                    placeholder="昵称（可选）"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                  />
                )}
                <Input
                  type="email"
                  placeholder="邮箱"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                />
                <Input
                  type="password"
                  placeholder="密码（至少 8 位）"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                />
                {authError && <p className="text-sm text-red-500">{authError}</p>}
                <Button onClick={handleAuth} disabled={authLoading || !authEmail || !authPassword} className="w-full">
                  {authLoading ? "处理中..." : authMode === "register" ? "注册" : "登录"}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Step 2: Probe & Test Cases */}
      {step === 2 && (
        <div className="space-y-6">
          {/* Agent info summary */}
          <Card>
            <CardContent className="pt-6 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{name}</h3>
                  <p className="text-sm text-gray-500 mt-1">{description}</p>
                </div>
                <Badge variant="secondary">{category}</Badge>
              </div>
              {capabilities.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {capabilities.map((c, i) => (
                    <Badge key={i} variant="outline">{c.name}</Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Test cases */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span>测试用例</span>
                {probing && <span className="text-sm font-normal text-gray-400">探测中...</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {probing ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
                  <span className="ml-3 text-sm text-gray-500">正在向 Agent 获取测试用例...</span>
                </div>
              ) : (
                <>
                  {testCases.map((tc, i) => (
                    <div key={i} className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-500">测试 #{i + 1}</span>
                        <button
                          onClick={() => removeTestCase(i)}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          移除
                        </button>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-500">输入</Label>
                        <Textarea
                          value={tc.input}
                          onChange={(e) => updateTestCase(i, "input", e.target.value)}
                          rows={2}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-500">期望行为</Label>
                        <Input
                          value={tc.expected}
                          onChange={(e) => updateTestCase(i, "expected", e.target.value)}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-500">对应能力</Label>
                        <Input
                          value={tc.capability}
                          onChange={(e) => updateTestCase(i, "capability", e.target.value)}
                          className="text-sm"
                          placeholder="可选"
                        />
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={addTestCase} className="flex-1">
                      + 添加测试用例
                    </Button>
                    <Button variant="outline" onClick={handleProbe} disabled={probing}>
                      重新探测
                    </Button>
                  </div>
                </>
              )}
              <Button
                onClick={handleStartTests}
                disabled={testCases.length === 0 || probing}
                className="w-full h-12 text-base"
              >
                开始测试（{testCases.length} 个用例）
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 3: Visual Testing */}
      {step === 3 && (
        <div className="space-y-6">
          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">
                测试进度：{completedTests} / {testCases.length}
              </span>
              {testingDone && (
                <span className="font-medium">
                  综合评分：
                  <span className={`ml-1 inline-flex items-center rounded px-2 py-0.5 text-xs font-bold border ${GRADE_COLORS[avgGrade] || GRADE_COLORS[avgGrade[0]] || "bg-gray-100 text-gray-600"}`}>
                    {avgGrade}
                  </span>
                </span>
              )}
            </div>
            <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-teal-600 transition-all duration-500"
                style={{ width: `${(completedTests / Math.max(testCases.length, 1)) * 100}%` }}
              />
            </div>
          </div>

          {/* Test cards */}
          <div className="space-y-4">
            {testCases.map((tc, i) => {
              const result = testResults[i];
              const isRunning = testingIndex === i;
              const isPending = !result && !isRunning;

              return (
                <Card key={i} className={`transition-all ${isRunning ? "ring-2 ring-teal-400" : ""}`}>
                  <CardContent className="pt-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">测试 #{i + 1}</span>
                        {tc.capability && (
                          <Badge variant="outline" className="text-xs">{tc.capability}</Badge>
                        )}
                      </div>
                      {isRunning && (
                        <div className="flex items-center gap-2">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
                          <span className="text-xs text-teal-600">测试中...</span>
                        </div>
                      )}
                      {result && (
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center rounded px-2.5 py-1 text-sm font-bold border ${GRADE_COLORS[result.grade]}`}>
                            {result.grade}
                          </span>
                          <span className="text-xs text-gray-400">{result.response_time_ms}ms</span>
                        </div>
                      )}
                      {isPending && (
                        <span className="text-xs text-gray-300">等待中</span>
                      )}
                    </div>

                    <div className="rounded-md bg-gray-50 p-3">
                      <p className="text-sm text-gray-600">
                        <span className="font-medium text-gray-400">输入：</span>{tc.input}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        <span className="font-medium text-gray-400">期望：</span>{tc.expected}
                      </p>
                    </div>

                    {result && (
                      <div className="space-y-2">
                        <div className="rounded-md bg-white border p-3">
                          <p className="text-xs text-gray-400 mb-1">实际响应</p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-4">
                            {result.response_content || "(空响应)"}
                          </p>
                        </div>
                        <p className="text-xs text-gray-500">{result.evaluation}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {testingDone && (
            <Button onClick={handleGetPricing} className="w-full h-12 text-base">
              查看定价建议 →
            </Button>
          )}
        </div>
      )}

      {/* Step 4: Pricing & Publish */}
      {step === 4 && (
        <div className="space-y-6">
          {/* Test summary (only for endpoint mode) */}
          {connectMode === "endpoint" && completedTests > 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold">{completedTests}</p>
                    <p className="text-xs text-gray-400">测试用例</p>
                  </div>
                  <div>
                    <p className={`text-2xl font-bold ${
                      avgGrade.startsWith("A") ? "text-green-600" :
                      avgGrade.startsWith("B") ? "text-teal-600" :
                      avgGrade.startsWith("C") ? "text-yellow-600" : "text-red-600"
                    }`}>{avgGrade}</p>
                    <p className="text-xs text-gray-400">综合评分</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {testResults.filter((r) => r && (r.grade === "A" || r.grade === "B")).length}/{completedTests}
                    </p>
                    <p className="text-xs text-gray-400">通过率</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pricing suggestion (only for endpoint mode) */}
          {connectMode === "endpoint" && loadingPricing ? (
            <Card>
              <CardContent className="py-8 flex items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
                <span className="ml-3 text-sm text-gray-500">正在分析定价...</span>
              </CardContent>
            </Card>
          ) : connectMode === "endpoint" && pricingSuggestion && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">定价建议</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-teal-50 p-4">
                  <p className="text-sm text-teal-800">{pricingSuggestion.reasoning}</p>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center text-sm">
                  <div className="rounded-lg border p-3">
                    <p className="font-semibold">{pricingSuggestion.similar_count}</p>
                    <p className="text-xs text-gray-400">同类 Agent</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="font-semibold">
                      {{ high: "高", medium: "中", low: "低" }[pricingSuggestion.scarcity]}
                    </p>
                    <p className="text-xs text-gray-400">稀缺度</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="font-semibold">¥{pricingSuggestion.category_avg}</p>
                    <p className="text-xs text-gray-400">分类均价</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">建议区间</span>
                    <span className="font-medium text-teal-600">
                      ¥{pricingSuggestion.suggested_low} - ¥{pricingSuggestion.suggested_high} / 百万 tokens
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Editable fields */}
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

          {/* Auth */}
          {showAuth && !user && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex gap-2 text-sm">
                  <button
                    className={authMode === "register" ? "font-medium text-teal-600" : "text-gray-400"}
                    onClick={() => setAuthMode("register")}
                  >
                    注册
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    className={authMode === "login" ? "font-medium text-teal-600" : "text-gray-400"}
                    onClick={() => setAuthMode("login")}
                  >
                    登录
                  </button>
                </div>
                {authMode === "register" && (
                  <Input
                    placeholder="昵称（可选）"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                  />
                )}
                <Input
                  type="email"
                  placeholder="邮箱"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                />
                <Input
                  type="password"
                  placeholder="密码（至少 8 位）"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                />
                {authError && <p className="text-sm text-red-500">{authError}</p>}
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
