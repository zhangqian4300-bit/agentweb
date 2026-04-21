"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/lib/hooks";
import type { AgentListItem, TaskListItem, PaginatedResponse } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const CATEGORIES = ["全部", "文献与知识", "数据与计算", "生命科学", "化学与材料", "物理与工程", "地球与环境", "数学与AI", "写作与协作"];
const SORT_OPTIONS = [
  { value: "calls", label: "按调用量" },
  { value: "price", label: "按价格" },
  { value: "newest", label: "最新上架" },
];
const TASK_SORT_OPTIONS = [
  { value: "newest", label: "最新" },
  { value: "bounty", label: "金额最高" },
];
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: "悬赏中", color: "bg-green-100 text-green-700" },
  completed: { label: "已完成", color: "bg-gray-100 text-gray-600" },
  cancelled: { label: "已取消", color: "bg-red-100 text-red-600" },
};

type Tab = "agents" | "tasks";

export default function HomePage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("agents");
  const [smartQuery, setSmartQuery] = useState("");

  // Agent state
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [agentTotal, setAgentTotal] = useState(0);
  const [agentPage, setAgentPage] = useState(1);
  const [category, setCategory] = useState("全部");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 400);
  const [sort, setSort] = useState("calls");
  const [agentLoading, setAgentLoading] = useState(true);

  // Task state
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [taskTotal, setTaskTotal] = useState(0);
  const [taskPage, setTaskPage] = useState(1);
  const [taskCategory, setTaskCategory] = useState("全部");
  const [taskSort, setTaskSort] = useState("newest");
  const [taskLoading, setTaskLoading] = useState(true);

  const fetchAgents = useCallback(async () => {
    setAgentLoading(true);
    try {
      const data = await api<PaginatedResponse<AgentListItem>>("/api/v1/agents", {
        params: {
          page: agentPage,
          page_size: 12,
          category: category === "全部" ? undefined : category,
          q: debouncedSearch || undefined,
          sort,
        },
      });
      setAgents(data.items);
      setAgentTotal(data.total);
    } catch {
      setAgents([]);
    } finally {
      setAgentLoading(false);
    }
  }, [agentPage, category, debouncedSearch, sort]);

  const fetchTasks = useCallback(async () => {
    setTaskLoading(true);
    try {
      const data = await api<PaginatedResponse<TaskListItem>>("/api/v1/tasks", {
        params: {
          page: taskPage,
          page_size: 12,
          category: taskCategory === "全部" ? undefined : taskCategory,
          status: "open",
          sort: taskSort,
        },
      });
      setTasks(data.items);
      setTaskTotal(data.total);
    } catch {
      setTasks([]);
    } finally {
      setTaskLoading(false);
    }
  }, [taskPage, taskCategory, taskSort]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    if (tab === "tasks") fetchTasks();
  }, [tab, fetchTasks]);

  useEffect(() => {
    setAgentPage(1);
  }, [category, debouncedSearch, sort]);

  useEffect(() => {
    setTaskPage(1);
  }, [taskCategory, taskSort]);

  const agentTotalPages = Math.ceil(agentTotal / 12);
  const taskTotalPages = Math.ceil(taskTotal / 12);

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-blue-50 to-white px-4 py-20 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">
          描述你的问题，AI 帮你找到合适的 Agent
        </h1>
        <p className="mt-3 text-lg text-gray-500">
          用自然语言描述需求，智能匹配最佳 Agent；找不到就发悬赏
        </p>
        <div className="mx-auto mt-8 max-w-lg">
          <div className="flex gap-2">
            <Input
              placeholder="描述你想解决的问题，如：我需要分析蛋白质结构..."
              value={smartQuery}
              onChange={(e) => setSmartQuery(e.target.value)}
              className="h-12 rounded-full bg-white px-6 text-base shadow-sm flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && smartQuery.trim()) {
                  router.push(`/search?q=${encodeURIComponent(smartQuery.trim())}`);
                }
              }}
            />
            <Button
              className="h-12 rounded-full px-6"
              onClick={() => {
                if (smartQuery.trim()) {
                  router.push(`/search?q=${encodeURIComponent(smartQuery.trim())}`);
                }
              }}
            >
              智能搜索
            </Button>
          </div>
        </div>
      </section>

      {/* Tab Switcher */}
      <section className="mx-auto max-w-7xl px-4 pt-8">
        <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1 w-fit">
          <button
            onClick={() => setTab("agents")}
            className={`rounded-md px-5 py-2 text-sm font-medium transition-colors ${
              tab === "agents"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Agent 广场
          </button>
          <button
            onClick={() => setTab("tasks")}
            className={`rounded-md px-5 py-2 text-sm font-medium transition-colors ${
              tab === "tasks"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            悬赏任务
          </button>
        </div>
      </section>

      {/* Agent Tab */}
      {tab === "agents" && (
        <>
          {/* Filter */}
          <section className="mx-auto max-w-7xl px-4 pt-6">
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
              <div className="flex items-center gap-3">
                <Input
                  placeholder="关键词筛选..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 w-40 text-sm"
                />
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
            </div>
          </section>

          {/* Agent Grid */}
          <section className="mx-auto max-w-7xl px-4 py-8">
            {agentLoading ? (
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

                {agentTotalPages > 1 && (
                  <div className="mt-8 flex justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={agentPage <= 1}
                      onClick={() => setAgentPage((p) => p - 1)}
                    >
                      上一页
                    </Button>
                    <span className="flex items-center px-3 text-sm text-gray-500">
                      {agentPage} / {agentTotalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={agentPage >= agentTotalPages}
                      onClick={() => setAgentPage((p) => p + 1)}
                    >
                      下一页
                    </Button>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}

      {/* Tasks Tab */}
      {tab === "tasks" && (
        <>
          {/* Filter */}
          <section className="mx-auto max-w-7xl px-4 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setTaskCategory(cat)}
                    className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                      taskCategory === cat
                        ? "bg-orange-500 text-white"
                        : "bg-white text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex gap-3">
                  {TASK_SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setTaskSort(opt.value)}
                      className={`text-sm transition-colors ${
                        taskSort === opt.value ? "font-medium text-orange-600" : "text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <Link href="/tasks/new">
                  <Button size="sm" className="bg-orange-500 hover:bg-orange-600">
                    发布悬赏
                  </Button>
                </Link>
              </div>
            </div>
          </section>

          {/* Task Grid */}
          <section className="mx-auto max-w-7xl px-4 py-8">
            {taskLoading ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-40 animate-pulse rounded-lg bg-gray-200" />
                ))}
              </div>
            ) : tasks.length === 0 ? (
              <div className="py-20 text-center">
                <p className="text-gray-400">暂无悬赏任务</p>
                <Link href="/tasks/new">
                  <Button className="mt-4 bg-orange-500 hover:bg-orange-600">
                    发布第一个悬赏任务
                  </Button>
                </Link>
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

                {taskTotalPages > 1 && (
                  <div className="mt-8 flex justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={taskPage <= 1}
                      onClick={() => setTaskPage((p) => p - 1)}
                    >
                      上一页
                    </Button>
                    <span className="flex items-center px-3 text-sm text-gray-500">
                      {taskPage} / {taskTotalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={taskPage >= taskTotalPages}
                      onClick={() => setTaskPage((p) => p + 1)}
                    >
                      下一页
                    </Button>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
