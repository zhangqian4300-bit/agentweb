"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { AgentListItem } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Recommendation {
  agent: AgentListItem;
  match_reason: string;
  relevance: number;
}

interface SearchResult {
  understanding: string;
  recommendations: Recommendation[];
  suggested_category: string;
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-gray-400">加载中...</div>}>
      <SearchContent />
    </Suspense>
  );
}

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const q = searchParams.get("q") || "";
  const [query, setQuery] = useState(q);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const doSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await api<SearchResult>("/api/v1/agents/smart-search", {
        method: "POST",
        body: { query: searchQuery },
      });
      setResult(data);
    } catch {
      setError("搜索失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (q) doSearch(q);
  }, [q, doSearch]);

  const handleSearch = () => {
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      {/* Search bar */}
      <div className="mb-8">
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="描述你想解决的问题..."
            className="h-12 text-base"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
          />
          <Button onClick={handleSearch} disabled={loading} className="h-12 px-6">
            {loading ? "搜索中..." : "搜索"}
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="mt-4 text-sm text-gray-500">AI 正在理解你的需求并匹配 Agent...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-600">{error}</div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-6">
          {/* AI understanding */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-5">
              <p className="text-sm text-blue-800">
                <span className="font-medium">AI 理解：</span>
                {result.understanding}
              </p>
              {result.suggested_category && (
                <Badge variant="secondary" className="mt-2">
                  推荐分类：{result.suggested_category}
                </Badge>
              )}
            </CardContent>
          </Card>

          {/* Recommendations */}
          {result.recommendations.length > 0 ? (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">推荐 Agent</h2>
              {result.recommendations.map((rec, i) => (
                <Card key={i} className="transition-shadow hover:shadow-md">
                  <CardContent className="pt-5">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/agents/${rec.agent.id}`}
                            className="text-lg font-semibold hover:text-blue-600"
                          >
                            {rec.agent.name}
                          </Link>
                          <span
                            className={`inline-flex items-center gap-1 text-xs ${
                              rec.agent.status === "online" ? "text-green-600" : "text-gray-400"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                rec.agent.status === "online" ? "bg-green-500" : "bg-gray-300"
                              }`}
                            />
                            {rec.agent.status === "online" ? "在线" : "离线"}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-500">
                          {rec.agent.description || "暂无描述"}
                        </p>
                        <p className="mt-2 text-sm text-blue-700 bg-blue-50 rounded px-2 py-1 inline-block">
                          {rec.match_reason}
                        </p>
                      </div>
                      <div className="ml-4 flex flex-col items-end gap-2">
                        <span className="text-sm font-medium text-blue-600">
                          ¥{rec.agent.pricing_per_million_tokens}/M
                        </span>
                        <div className="flex items-center gap-1">
                          <div className="h-1.5 w-16 rounded-full bg-gray-200 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-blue-500"
                              style={{ width: `${Math.round(rec.relevance * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400">
                            {Math.round(rec.relevance * 100)}%
                          </span>
                        </div>
                        <Link href={`/agents/${rec.agent.id}`}>
                          <Button size="sm">试用</Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-gray-400">
              未找到匹配的 Agent
            </div>
          )}

          {/* Bounty CTA */}
          <Card className="border-dashed border-2 border-gray-300">
            <CardContent className="py-8 text-center">
              <h3 className="text-lg font-semibold text-gray-700">找不到合适的 Agent？</h3>
              <p className="mt-2 text-sm text-gray-500">
                发布悬赏任务，让 Agent 开发者来帮你解决问题
              </p>
              <Link href={`/tasks/new?q=${encodeURIComponent(q)}`}>
                <Button variant="outline" className="mt-4">
                  发布悬赏任务
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
