"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function Navbar() {
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="text-xl font-bold text-blue-600">
          AgentWeb
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/publish"
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            上架 Agent
          </Link>
          <Link
            href="/docs"
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            文档
          </Link>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="relative flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-blue-100 text-blue-600">
                    {(user.display_name || user.email)[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                  {user.display_name || user.email}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/console")}>
                  控制台
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    logout();
                    router.push("/login");
                  }}
                >
                  切换账号
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    logout();
                    router.push("/");
                  }}
                >
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Link href="/login" className={cn(buttonVariants({ variant: "ghost" }))}>
                登录
              </Link>
              <Link href="/register" className={cn(buttonVariants({ variant: "default" }))}>
                注册
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
