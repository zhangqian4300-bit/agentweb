"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const CATEGORIES = ["文献与知识", "数据与计算", "生命科学", "化学与材料", "物理与工程", "地球与环境", "数学与AI", "写作与协作", "其他"];

interface Attachment {
  filename: string;
  url: string;
  download_url: string;
  size: number;
}

export default function NewTaskPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-gray-400">加载中...</div>}>
      <NewTaskContent />
    </Suspense>
  );
}

function NewTaskContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const q = searchParams.get("q") || "";

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [bountyAmount, setBountyAmount] = useState("50");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (q) handleGenerate(q);
  }, []);

  async function handleGenerate(query: string) {
    setGenerating(true);
    try {
      const result = await api<{
        title: string;
        description: string;
        category: string;
        suggested_bounty: number;
      }>("/api/v1/tasks/generate-description", {
        method: "POST",
        body: { query },
      });
      setTitle(result.title || "");
      setDescription(result.description || "");
      setCategory(result.category || "其他");
      if (result.suggested_bounty) {
        setBountyAmount(String(result.suggested_bounty));
      }
    } catch {
      toast.error("AI 生成失败，请手动填写");
    } finally {
      setGenerating(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    async function doUpload(token: string | null) {
      return fetch(`${API_BASE}/api/v1/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
    }

    try {
      let token = localStorage.getItem("access_token");
      let res = await doUpload(token);

      if (res.status === 401) {
        const refreshToken = localStorage.getItem("refresh_token");
        if (refreshToken) {
          const refreshRes = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });
          if (refreshRes.ok) {
            const tokens = await refreshRes.json();
            localStorage.setItem("access_token", tokens.access_token);
            localStorage.setItem("refresh_token", tokens.refresh_token);
            token = tokens.access_token;
            res = await doUpload(token);
          }
        }
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "上传失败" }));
        throw new Error(err.detail);
      }
      const data = await res.json();
      setAttachments((prev) => [...prev, data]);
      toast.success("文件已上传");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handlePublish() {
    if (!user) {
      toast.error("请先登录");
      router.push("/login?redirect=/tasks/new");
      return;
    }
    setPublishing(true);
    try {
      const task = await api<{ id: string }>("/api/v1/tasks", {
        method: "POST",
        body: {
          title,
          description,
          category: category || undefined,
          bounty_amount: Number(bountyAmount),
          attachments,
        },
      });
      toast.success("悬赏任务已发布！");
      router.push(`/tasks/${task.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "发布失败");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold">发布悬赏任务</h1>
        <p className="mt-2 text-gray-500">
          描述你的需求，AI 帮你生成任务描述，设定悬赏金额
        </p>
      </div>

      {/* AI generate from query */}
      {!title && !generating && (
        <Card className="mb-6">
          <CardContent className="pt-6 space-y-3">
            <Label>描述你的问题（AI 将自动生成任务详情）</Label>
            <div className="flex gap-2">
              <Input
                placeholder="例如：我需要一个能分析蛋白质结构的工具..."
                defaultValue={q}
                id="query-input"
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleGenerate((e.target as HTMLInputElement).value);
                  }
                }}
              />
              <Button
                onClick={() => {
                  const input = document.getElementById("query-input") as HTMLInputElement;
                  if (input?.value) handleGenerate(input.value);
                }}
                disabled={generating}
              >
                AI 生成
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {generating && (
        <Card className="mb-6">
          <CardContent className="py-12 flex flex-col items-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
            <p className="mt-4 text-sm text-gray-500">AI 正在生成任务描述...</p>
          </CardContent>
        </Card>
      )}

      {/* Task form */}
      {(title || !generating) && (
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label>任务标题</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="简洁描述你的需求"
                />
              </div>
              <div className="space-y-2">
                <Label>任务描述</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                  placeholder="详细描述你的需求、背景、期望输出..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>分类</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v ?? "")}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择分类" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>悬赏金额（¥）</Label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={bountyAmount}
                    onChange={(e) => setBountyAmount(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Attachments */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">附件</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {attachments.map((att, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{att.filename}</span>
                    <span className="text-xs text-gray-400">
                      ({(att.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                  <button
                    onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    移除
                  </button>
                </div>
              ))}
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleUpload}
                className="hidden"
                accept=".txt,.pdf,.csv,.json,.xlsx,.png,.jpg,.jpeg,.zip"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full"
              >
                {uploading ? "上传中..." : "+ 上传附件"}
              </Button>
              <p className="text-xs text-gray-400">
                支持 txt, pdf, csv, json, xlsx, png, jpg, zip，最大 10MB
              </p>
            </CardContent>
          </Card>

          {user && (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <span className="text-sm text-gray-500">当前余额</span>
              <span className={`text-lg font-semibold ${Number(bountyAmount) > Number(user.balance) ? "text-red-500" : "text-gray-900"}`}>
                ¥{Number(user.balance).toFixed(2)}
              </span>
            </div>
          )}

          {user && Number(bountyAmount) > Number(user.balance) && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
              余额不足，请先充值后再发布悬赏任务
            </div>
          )}

          <Button
            onClick={handlePublish}
            disabled={publishing || !title || !bountyAmount || (user ? Number(bountyAmount) > Number(user.balance) : false)}
            className="w-full h-12 text-base bg-orange-500 hover:bg-orange-600"
          >
            {publishing ? "发布中..." : `发布悬赏（¥${bountyAmount}）`}
          </Button>
        </div>
      )}
    </div>
  );
}
