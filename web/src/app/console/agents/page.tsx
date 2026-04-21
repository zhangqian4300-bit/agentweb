"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Agent, PaginatedResponse } from "@/lib/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export default function MyAgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      const data = await api<PaginatedResponse<Agent>>("/api/v1/agents/mine", {
        params: { page: 1, page_size: 100 },
      });
      setAgents(data.items);
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await api(`/api/v1/agents/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Agent 已删除");
      setDeleteTarget(null);
      fetchAgents();
    } catch {
      toast.error("删除失败");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">我的 Agent</h1>
        <Link href="/console/agents/new" className={cn(buttonVariants({ variant: "default" }))}>
          创建新 Agent
        </Link>
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-lg bg-gray-200" />
      ) : agents.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed p-12 text-center text-gray-400">
          <p className="text-lg">还没有创建 Agent</p>
          <p className="mt-1 text-sm">点击上方按钮创建你的第一个 Agent</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>版本</TableHead>
              <TableHead>价格</TableHead>
              <TableHead>调用次数</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents.map((agent) => (
              <TableRow key={agent.id}>
                <TableCell className="font-medium">{agent.name}</TableCell>
                <TableCell>
                  <Badge variant={agent.status === "online" ? "default" : "secondary"}>
                    {agent.status === "online" ? "在线" : "离线"}
                  </Badge>
                </TableCell>
                <TableCell>v{agent.version}</TableCell>
                <TableCell>¥{agent.pricing_per_million_tokens}/M</TableCell>
                <TableCell>{agent.total_calls}</TableCell>
                <TableCell>
                  {new Date(agent.created_at).toLocaleDateString("zh-CN")}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/console/agents/${agent.id}/edit`}
                      className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                    >
                      编辑
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600"
                      onClick={() => setDeleteTarget(agent)}
                    >
                      删除
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除 Agent「{deleteTarget?.name}」吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
