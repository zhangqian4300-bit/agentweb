"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/lib/hooks";
import type { AgentListItem, PaginatedResponse } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const CATEGORIES = ["全部", "法律", "医疗", "代码", "数据", "翻译", "写作", "教育"];
const SORT_OPTIONS = [
  { value: "calls", label: "按调用量" },
  { value: "price", label: "按价格" },
  { value: "newest", label: "最新上架" },
];

export default function HomePage() {
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("全部");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 400);
  const [sort, setSort] = useState("calls");
  const [loading, setLoading] = useState(true);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<PaginatedResponse<AgentListItem>>("/api/v1/agents", {
        params: {
          page,
          page_size: 12,
          category: category === "全部" ? undefined : category,
          q: debouncedSearch || undefined,
          sort,
        },
      });
      setAgents(data.items);
      setTotal(data.total);
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, [page, category, debouncedSearch, sort]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    setPage(1);
  }, [category, debouncedSearch, sort]);

  const totalPages = Math.ceil(total / 12);

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-blue-50 to-white px-4 py-20 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">
          发现并调用领域专家 Agent
        </h1>
        <p className="mt-3 text-lg text-gray-500">
          开发者上架领域 Agent，消费方按量付费调用
        </p>
        <div className="mx-auto mt-8 max-w-md">
          <Input
            placeholder="搜索 Agent 名称或描述..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-12 rounded-full bg-white px-6 text-base shadow-sm"
          />
        </div>
      </section>

      {/* Filter */}
      <section className="mx-auto max-w-7xl px-4 pt-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                  category === cat
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-100"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSort(opt.value)}
                className={`text-sm transition-colors ${
                  sort === opt.value ? "font-medium text-blue-600" : "text-gray-400 hover:text-gray-600"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Agent Grid */}
      <section className="mx-auto max-w-7xl px-4 py-8">
        {loading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-48 animate-pulse rounded-lg bg-gray-200" />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div className="py-20 text-center text-gray-400">
            暂无 Agent，敬请期待
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {agents.map((agent) => (
                <Link key={agent.id} href={`/agents/${agent.id}`}>
                  <Card className="h-full transition-shadow hover:shadow-md">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg">{agent.name}</CardTitle>
                        <span
                          className={`inline-flex items-center gap-1 text-xs ${
                            agent.status === "online" ? "text-green-600" : "text-gray-400"
                          }`}
                        >
                          <span
                            className={`h-2 w-2 rounded-full ${
                              agent.status === "online" ? "bg-green-500" : "bg-gray-300"
                            }`}
                          />
                          {agent.status === "online" ? "在线" : "离线"}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="line-clamp-2 text-sm text-gray-500">
                        {agent.description || "暂无描述"}
                      </p>
                      <div className="mt-4 flex items-center justify-between">
                        <Badge variant="secondary">{agent.category || "其他"}</Badge>
                        <span className="text-sm font-medium text-blue-600">
                          ¥{agent.pricing_per_million_tokens}/M tokens
                        </span>
                      </div>
                      <div className="mt-3 flex gap-4 text-xs text-gray-400">
                        <span>{agent.total_calls} 次调用</span>
                        <span>
                          {agent.avg_response_time_ms > 0
                            ? `${agent.avg_response_time_ms}ms`
                            : "-"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  上一页
                </Button>
                <span className="flex items-center px-3 text-sm text-gray-500">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  下一页
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
