"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import type { Task, TaskAttempt, AgentListItem, PaginatedResponse } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: "悬赏中", color: "bg-green-100 text-green-700" },
  completed: { label: "已完成", color: "bg-gray-100 text-gray-600" },
  cancelled: { label: "已取消", color: "bg-red-100 text-red-600" },
};

export default function TaskDetailPage() {
  const params = useParams();
  const { user } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempts, setAttempts] = useState<TaskAttempt[]>([]);

  // Agent search
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [agentSearch, setAgentSearch] = useState("");
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentListItem | null>(null);
  const [message, setMessage] = useState("");
  const [trying, setTrying] = useState(false);
  const [tryResult, setTryResult] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id) return;
    Promise.all([
      api<Task>(`/api/v1/tasks/${params.id}`),
      api<TaskAttempt[]>(`/api/v1/tasks/${params.id}/attempts`),
    ])
      .then(([t, a]) => {
        setTask(t);
        setAttempts(a);
      })
      .catch(() => setTask(null))
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    api<PaginatedResponse<AgentListItem>>("/api/v1/agents", {
      params: { page_size: 100, status: "online" },
    })
      .then((data) => setAgents(data.items))
      .catch(() => {});
  }, []);

  const filteredAgents = useMemo(() => {
    if (!agentSearch.trim()) return agents;
    const q = agentSearch.toLowerCase();
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.category || "").toLowerCase().includes(q) ||
        (a.description || "").toLowerCase().includes(q)
    );
  }, [agents, agentSearch]);

  const handleTry = useCallback(async () => {
    if (!selectedAgent || !message.trim()) return;
    setTrying(true);
    setTryResult(null);
    try {
      const result = await api<{ response: string; agent_name: string }>(
        `/api/v1/tasks/${params.id}/try`,
        {
          method: "POST",
          body: { agent_id: selectedAgent.id, message: message.trim() },
        }
      );
      setTryResult(result.response);
      const newAttempts = await api<TaskAttempt[]>(`/api/v1/tasks/${params.id}/attempts`);
      setAttempts(newAttempts);
      toast.success(`${result.agent_name} 已回复`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "调用失败");
    } finally {
      setTrying(false);
    }
  }, [selectedAgent, message, params.id]);

  const handleComplete = async (attemptId: string) => {
    try {
      const updated = await api<Task>(`/api/v1/tasks/${params.id}`, {
        method: "PATCH",
        body: { status: "completed", winning_attempt_id: attemptId },
      });
      setTask(updated);
      toast.success("任务已完成，悬赏金额已发放给答题者");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "操作失败");
    }
  };

  const handleCancel = async () => {
    if (!confirm("确认取消任务？悬赏金额将退回到你的余额。")) return;
    try {
      const updated = await api<Task>(`/api/v1/tasks/${params.id}`, {
        method: "PATCH",
        body: { status: "cancelled" },
      });
      setTask(updated);
      toast.success("任务已取消，悬赏金额已退回");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "操作失败");
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="h-96 animate-pulse rounded-lg bg-gray-200" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="py-20 text-center text-gray-400">任务不存在</div>
    );
  }

  const statusInfo = STATUS_LABELS[task.status] || STATUS_LABELS.open;
  const isOwner = user && task.creator_id === user.id;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-gray-400">
        <Link href="/" className="hover:text-gray-600">首页</Link>
        <span className="mx-2">/</span>
        <Link href="/tasks" className="hover:text-gray-600">悬赏任务</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-700">{task.title}</span>
      </nav>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Main */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{task.title}</h1>
              <span className={`rounded-full px-2 py-0.5 text-xs ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-400">
              {task.creator_name} · {new Date(task.created_at).toLocaleDateString("zh-CN")}
            </p>
          </div>

          <div className="prose prose-sm max-w-none">
            <p className="leading-relaxed text-gray-600 whitespace-pre-wrap">
              {task.ai_description || task.description || "暂无描述"}
            </p>
          </div>

          {task.attachments.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold mb-3">附件</h3>
                <div className="space-y-2">
                  {task.attachments.map((att, i) => (
                    <a
                      key={i}
                      href={`${API_BASE}${att.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-md border p-3 text-sm hover:bg-gray-50"
                    >
                      <span className="text-teal-600">{att.filename}</span>
                      <span className="text-xs text-gray-400">
                        ({(att.size / 1024).toFixed(1)} KB)
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Try Agent — searchable */}
          {task.status === "open" && user && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">用 Agent 尝试完成任务</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Agent search */}
                <div className="relative">
                  <Input
                    placeholder="搜索 Agent（名称、分类、描述）..."
                    value={selectedAgent ? selectedAgent.name : agentSearch}
                    onChange={(e) => {
                      setAgentSearch(e.target.value);
                      setSelectedAgent(null);
                      setAgentDropdownOpen(true);
                    }}
                    onFocus={() => {
                      if (!selectedAgent) setAgentDropdownOpen(true);
                    }}
                    onBlur={() => {
                      setTimeout(() => setAgentDropdownOpen(false), 200);
                    }}
                  />
                  {selectedAgent && (
                    <button
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
                      onClick={() => {
                        setSelectedAgent(null);
                        setAgentSearch("");
                      }}
                    >
                      清除
                    </button>
                  )}
                  {agentDropdownOpen && !selectedAgent && (
                    <div className="absolute z-20 mt-1 w-full rounded-md border bg-white shadow-lg max-h-60 overflow-y-auto">
                      {filteredAgents.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-400">
                          没有找到在线的 Agent
                        </div>
                      ) : (
                        filteredAgents.map((agent) => (
                          <button
                            key={agent.id}
                            className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center justify-between border-b last:border-b-0"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setSelectedAgent(agent);
                              setAgentSearch("");
                              setAgentDropdownOpen(false);
                            }}
                          >
                            <div>
                              <span className="text-sm font-medium">{agent.name}</span>
                              {agent.category && (
                                <span className="ml-2 text-xs text-gray-400">
                                  {agent.category}
                                </span>
                              )}
                              {agent.description && (
                                <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                                  {agent.description}
                                </p>
                              )}
                            </div>
                            <span className="text-xs text-teal-600 whitespace-nowrap ml-3">
                              ¥{agent.pricing_per_million_tokens}/M
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="输入你想问 Agent 的问题或补充说明..."
                    rows={3}
                  />
                </div>
                <Button
                  onClick={handleTry}
                  disabled={trying || !selectedAgent || !message.trim()}
                  className="w-full"
                >
                  {trying ? "调用中..." : "发送给 Agent"}
                </Button>
                {tryResult && (
                  <div className="rounded-lg border bg-gray-50 p-4">
                    <p className="text-xs text-gray-400 mb-2">Agent 回复</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{tryResult}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Past attempts */}
          {attempts.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-4">
                历史尝试
                <span className="ml-2 text-sm font-normal text-gray-400">
                  共 {attempts.length} 次
                </span>
              </h3>
              <div className="space-y-4">
                {attempts.map((attempt) => {
                  const isWinner = task.winning_attempt_id === attempt.id;
                  return (
                    <Card
                      key={attempt.id}
                      className={isWinner ? "ring-2 ring-orange-400 bg-orange-50/30" : ""}
                    >
                      <CardContent className="pt-4 space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{attempt.agent_name}</span>
                            {isWinner && (
                              <Badge className="bg-orange-100 text-orange-700 border-orange-300">
                                最佳结果
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-gray-400">
                            {new Date(attempt.created_at).toLocaleString("zh-CN")}
                          </span>
                        </div>
                        {attempt.messages.map((msg, i) => (
                          <div
                            key={i}
                            className={`rounded-md p-3 text-sm ${
                              msg.role === "user"
                                ? "bg-teal-50 text-teal-800"
                                : "bg-gray-50 text-gray-700"
                            }`}
                          >
                            <span className="text-xs font-medium text-gray-400 block mb-1">
                              {msg.role === "user" ? "提问" : "Agent 回复"}
                            </span>
                            <p className="whitespace-pre-wrap line-clamp-6">{msg.content}</p>
                          </div>
                        ))}
                        {/* Owner can select as winner */}
                        {isOwner && task.status === "open" && !isWinner && (
                          <div className="flex justify-end pt-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-orange-600 border-orange-300 hover:bg-orange-50"
                              onClick={() => handleComplete(attempt.id)}
                            >
                              采纳此结果
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-orange-600">¥{task.bounty_amount}</p>
              <p className="mt-1 text-sm text-gray-400">悬赏金额</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">分类</span>
                <Badge variant="secondary">{task.category || "其他"}</Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">状态</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${statusInfo.color}`}>
                  {statusInfo.label}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">尝试次数</span>
                <span>{attempts.length}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">发布时间</span>
                <span>{new Date(task.created_at).toLocaleDateString("zh-CN")}</span>
              </div>
            </CardContent>
          </Card>

          {isOwner && task.status === "open" && (
            <div className="space-y-3">
              {attempts.length > 0 && (
                <p className="text-xs text-gray-400 text-center">
                  在历史尝试中点击「采纳此结果」来完成任务
                </p>
              )}
              <Button
                variant="outline"
                className="w-full text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600"
                onClick={handleCancel}
              >
                取消任务（退回 ¥{task.bounty_amount}）
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
