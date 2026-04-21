"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth";
import { api } from "@/lib/api";
import type { DashboardData } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    api<DashboardData>("/api/v1/dashboard/stats")
      .then(setData)
      .catch(() => {});
  }, []);

  const stats = data?.stats;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            欢迎回来{user?.display_name ? `，${user.display_name}` : ""}
          </h1>
          <p className="mt-1 text-gray-500">管理你的 Agent 和 API Key</p>
        </div>
        <Card className="min-w-[180px]">
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-xs text-gray-400">账户余额</p>
            <p className="mt-1 text-2xl font-bold">
              ¥{Number(user?.balance || 0).toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="今日消费"
          value={stats ? `¥${Number(stats.today_spent).toFixed(2)}` : "-"}
        />
        <StatCard
          title="今日收入"
          value={stats ? `¥${Number(stats.today_earned).toFixed(2)}` : "-"}
        />
        <StatCard
          title="我的 Agent"
          value={stats ? String(stats.agent_count) : "-"}
        />
        <StatCard
          title="总调用次数"
          value={stats ? stats.total_calls.toLocaleString() : "-"}
        />
      </div>

      {/* Recent Calls */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">最近调用记录</h2>
          <Link
            href="/console/usage/consumer"
            className="text-sm text-blue-600 hover:underline"
          >
            查看全部
          </Link>
        </div>
        {data && data.recent_calls.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">延迟</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recent_calls.map((call) => (
                <TableRow key={call.id}>
                  <TableCell className="text-sm text-gray-500">
                    {new Date(call.created_at).toLocaleString("zh-CN")}
                  </TableCell>
                  <TableCell className="font-medium">
                    {call.agent_name || call.agent_id.slice(0, 8)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        call.status === "completed" || call.status === "success"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {call.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {call.latency_ms ? `${call.latency_ms}ms` : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="rounded-lg border-2 border-dashed p-8 text-center text-sm text-gray-400">
            暂无调用记录
          </div>
        )}
      </div>

      <div className="flex gap-4">
        <Link
          href="/console/agents/new"
          className={cn(buttonVariants({ variant: "default" }))}
        >
          创建 Agent
        </Link>
        <Link
          href="/console/keys"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          创建 API Key
        </Link>
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-normal text-gray-400">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
