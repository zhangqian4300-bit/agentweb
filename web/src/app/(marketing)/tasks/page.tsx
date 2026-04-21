"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { TaskListItem, PaginatedResponse } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const CATEGORIES = ["全部", "文献与知识", "数据与计算", "生命科学", "化学与材料", "物理与工程", "地球与环境", "数学与AI", "写作与协作"];
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: "悬赏中", color: "bg-green-100 text-green-700" },
  completed: { label: "已完成", color: "bg-gray-100 text-gray-600" },
  cancelled: { label: "已取消", color: "bg-red-100 text-red-600" },
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("全部");
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<PaginatedResponse<TaskListItem>>("/api/v1/tasks", {
        params: {
          page,
          page_size: 12,
          category: category === "全部" ? undefined : category,
          status: "open",
          sort,
        },
      });
      setTasks(data.items);
      setTotal(data.total);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [page, category, sort]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    setPage(1);
  }, [category, sort]);

  const totalPages = Math.ceil(total / 12);

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-orange-50 to-white px-4 py-16 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          悬赏任务广场
        </h1>
        <p className="mt-3 text-gray-500">
          描述你的需求，设定悬赏金额，让 Agent 开发者来帮你解决
        </p>
        <Link href="/tasks/new">
          <Button className="mt-6 h-12 px-8 text-base">发布悬赏任务</Button>
        </Link>
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
                    ? "bg-orange-500 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-100"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            {[
              { value: "newest", label: "最新" },
              { value: "bounty", label: "金额最高" },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSort(opt.value)}
                className={`text-sm transition-colors ${
                  sort === opt.value ? "font-medium text-orange-600" : "text-gray-400 hover:text-gray-600"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Task Grid */}
      <section className="mx-auto max-w-7xl px-4 py-8">
        {loading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-lg bg-gray-200" />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="py-20 text-center text-gray-400">
            暂无悬赏任务
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {tasks.map((task) => {
                const statusInfo = STATUS_LABELS[task.status] || STATUS_LABELS.open;
                return (
                  <Link key={task.id} href={`/tasks/${task.id}`}>
                    <Card className="h-full transition-shadow hover:shadow-md">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-lg line-clamp-1">{task.title}</CardTitle>
                          <span className={`rounded-full px-2 py-0.5 text-xs ${statusInfo.color}`}>
                            {statusInfo.label}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="line-clamp-2 text-sm text-gray-500">
                          {task.description || "暂无描述"}
                        </p>
                        <div className="mt-4 flex items-center justify-between">
                          <Badge variant="secondary">{task.category || "其他"}</Badge>
                          <span className="text-lg font-bold text-orange-600">
                            ¥{task.bounty_amount}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                          <span>{task.creator_name}</span>
                          <span>{new Date(task.created_at).toLocaleDateString("zh-CN")}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>

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
