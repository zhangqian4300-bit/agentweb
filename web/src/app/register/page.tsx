"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/auth";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function getPasswordStrength(pw: string): {
  score: number;
  label: string;
  color: string;
} {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;

  if (score <= 1) return { score: 1, label: "弱", color: "bg-red-500" };
  if (score <= 2) return { score: 2, label: "较弱", color: "bg-orange-500" };
  if (score <= 3) return { score: 3, label: "中等", color: "bg-yellow-500" };
  if (score <= 4) return { score: 4, label: "强", color: "bg-green-500" };
  return { score: 5, label: "很强", color: "bg-green-600" };
}

export default function RegisterPage() {
  const { register, login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(email, password, displayName);
      await login(email, password);
      router.push("/console");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "注册失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <Link href="/" className="mb-2 text-2xl font-bold text-teal-600">
            AgentWeb
          </Link>
          <CardTitle className="text-lg">创建账号</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
              {password && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full ${
                          i <= strength.score ? strength.color : "bg-gray-200"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">
                    密码强度：{strength.label}
                  </p>
                </div>
              )}
              <p className="text-xs text-gray-400">至少 8 位字符</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">昵称（可选）</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "注册中..." : "注册"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-gray-500">
            已有账号？{" "}
            <Link href="/login" className="text-teal-600 hover:underline">
              去登录
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
