"use client";

import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "@/lib/api";
import type { APIKey, APIKeyCreated } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, EyeOff, Copy } from "lucide-react";
import { toast } from "sonner";

export default function APIKeysPage() {
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createdKey, setCreatedKey] = useState<APIKeyCreated | null>(null);

  const [revealedKeys, setRevealedKeys] = useState<Record<string, string>>({});

  const [newKeyType, setNewKeyType] = useState("api_key");
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchKeys = useCallback(async () => {
    try {
      const data = await api<APIKey[]>("/api/v1/keys");
      setKeys(data);
    } catch {
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  async function handleCreate() {
    setCreating(true);
    try {
      const created = await api<APIKeyCreated>("/api/v1/keys", {
        method: "POST",
        body: { key_type: newKeyType, name: newKeyName || undefined },
      });
      setCreatedKey(created);
      setShowCreate(false);
      setNewKeyName("");
      fetchKeys();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "创建失败");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    try {
      await api(`/api/v1/keys/${id}`, { method: "DELETE" });
      toast.success("Key 已撤销");
      fetchKeys();
    } catch {
      toast.error("撤销失败");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">API Key 管理</h1>
        <Button onClick={() => setShowCreate(true)}>创建新 Key</Button>
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-lg bg-gray-200" />
      ) : keys.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed p-12 text-center text-gray-400">
          <p className="text-lg">还没有 API Key</p>
          <p className="mt-1 text-sm">创建一个 API Key 开始调用 Agent</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>Key 前缀</TableHead>
              <TableHead>最后使用</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((key) => (
              <TableRow key={key.id}>
                <TableCell>{key.name || "-"}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {key.key_type === "agent_key" ? "Agent Key" : "API Key"}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-sm">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="min-w-[120px]">
                      {revealedKeys[key.id] || `${key.key_prefix}${"•".repeat(24)}`}
                    </span>
                    <button
                      className="text-gray-400 hover:text-gray-600"
                      onClick={async () => {
                        if (revealedKeys[key.id]) {
                          setRevealedKeys((prev) => {
                            const next = { ...prev };
                            delete next[key.id];
                            return next;
                          });
                        } else {
                          try {
                            const data = await api<{ key: string }>(`/api/v1/keys/${key.id}/reveal`);
                            setRevealedKeys((prev) => ({ ...prev, [key.id]: data.key }));
                          } catch {
                            toast.error("获取 Key 失败");
                          }
                        }
                      }}
                    >
                      {revealedKeys[key.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    {revealedKeys[key.id] && (
                      <button
                        className="text-gray-400 hover:text-gray-600"
                        onClick={() => {
                          navigator.clipboard.writeText(revealedKeys[key.id]);
                          toast.success("已复制");
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    )}
                  </span>
                </TableCell>
                <TableCell>
                  {key.last_used_at
                    ? new Date(key.last_used_at).toLocaleDateString("zh-CN")
                    : "从未使用"}
                </TableCell>
                <TableCell>
                  {new Date(key.created_at).toLocaleDateString("zh-CN")}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-600"
                    onClick={() => handleRevoke(key.id)}
                  >
                    撤销
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建 API Key</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>类型</Label>
              <Select value={newKeyType} onValueChange={(v) => setNewKeyType(v ?? "api_key")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="api_key">API Key（调用 Agent）</SelectItem>
                  <SelectItem value="agent_key">Agent Key（接入 Agent）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>名称（可选）</Label>
              <Input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Created Key Display */}
      <Dialog open={!!createdKey} onOpenChange={() => setCreatedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Key 创建成功</DialogTitle>
          </DialogHeader>
          <div className="rounded-lg bg-gray-100 p-3">
            <code className="break-all text-sm">{createdKey?.key}</code>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (createdKey) {
                  navigator.clipboard.writeText(createdKey.key);
                  toast.success("已复制到剪贴板");
                }
              }}
            >
              复制 Key
            </Button>
            <Button variant="outline" onClick={() => setCreatedKey(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
