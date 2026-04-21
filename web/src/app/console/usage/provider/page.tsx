"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import type { UsageRecord, PaginatedResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebouncedValue } from "@/lib/hooks";

export default function ProviderUsagePage() {
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [agentSearch, setAgentSearch] = useState("");
  const debouncedAgentSearch = useDebouncedValue(agentSearch, 400);

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<PaginatedResponse<UsageRecord>>("/api/v1/usage", {
        params: {
          role: "provider",
          page,
          page_size: 20,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          agent_name: debouncedAgentSearch || undefined,
        },
      });
      setRecords(data.items);
      setTotal(data.total);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [page, startDate, endDate, debouncedAgentSearch]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  useEffect(() => {
    setPage(1);
  }, [startDate, endDate, debouncedAgentSearch]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">收入明细</h1>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-40"
          placeholder="开始日期"
        />
        <span className="text-gray-400">-</span>
        <Input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="w-40"
          placeholder="结束日期"
        />
        <Input
          value={agentSearch}
          onChange={(e) => setAgentSearch(e.target.value)}
          placeholder="搜索 Agent 名称..."
          className="w-56"
        />
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-lg bg-gray-200" />
      ) : records.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed p-12 text-center text-gray-400">
          暂无收入记录
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>Agent ID</TableHead>
                <TableHead>输入 tokens</TableHead>
                <TableHead>输出 tokens</TableHead>
                <TableHead>总 tokens</TableHead>
                <TableHead>总费用</TableHead>
                <TableHead>平台抽成</TableHead>
                <TableHead>我的收入</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">
                    {new Date(r.created_at).toLocaleString("zh-CN")}
                  </TableCell>
                  <TableCell className="max-w-[120px] truncate font-mono text-xs">
                    {r.agent_id}
                  </TableCell>
                  <TableCell>{r.input_tokens.toLocaleString()}</TableCell>
                  <TableCell>{r.output_tokens.toLocaleString()}</TableCell>
                  <TableCell>{r.total_tokens.toLocaleString()}</TableCell>
                  <TableCell>¥{r.total_cost}</TableCell>
                  <TableCell className="text-gray-400">¥{r.platform_fee}</TableCell>
                  <TableCell className="font-medium text-green-600">
                    ¥{r.provider_earning}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === "success" || r.status === "completed" ? "default" : "secondary"}>
                      {r.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2">
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
    </div>
  );
}
