"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  const { user } = useAuth();
  const [displayName] = useState(user?.display_name || "");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">账户设置</h1>

      <Card>
        <CardHeader>
          <CardTitle>个人信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>邮箱</Label>
            <Input value={user?.email || ""} disabled />
          </div>
          <div className="space-y-2">
            <Label>昵称</Label>
            <Input value={displayName} disabled />
            <p className="text-xs text-gray-400">昵称修改功能即将上线</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>账户余额</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">
            ¥{Number(user?.balance || 0).toFixed(2)}
          </p>
          <Button className="mt-4" variant="outline" disabled>
            充值（即将上线）
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>修改密码</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>当前密码</Label>
            <Input type="password" disabled />
          </div>
          <div className="space-y-2">
            <Label>新密码</Label>
            <Input type="password" disabled />
          </div>
          <Button disabled>修改密码（即将上线）</Button>
        </CardContent>
      </Card>
    </div>
  );
}
