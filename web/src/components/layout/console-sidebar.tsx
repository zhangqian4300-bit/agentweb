"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bot, KeyRound, TrendingDown, TrendingUp, Settings, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/console", label: "总览", icon: BarChart3 },
  { href: "/console/agents", label: "我的 Agent", icon: Bot },
  { href: "/console/keys", label: "API Key", icon: KeyRound },
  { href: "/console/usage/consumer", label: "消费明细", icon: TrendingDown },
  { href: "/console/usage/provider", label: "收入明细", icon: TrendingUp },
  { href: "/console/settings", label: "账户设置", icon: Settings },
];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-4">
      {navItems.map((item) => {
        const isActive =
          item.href === "/console"
            ? pathname === "/console"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-spring",
              isActive
                ? "bg-teal-50 font-medium text-teal-600"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function ConsoleSidebar() {
  return (
    <aside className="hidden lg:block w-56 shrink-0 border-r border-slate-200/60 bg-[#FAFBFC]">
      <SidebarNav />
    </aside>
  );
}

export function ConsoleMobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 transition-spring">
          <Menu className="h-5 w-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <div className="border-b px-4 py-3">
            <span className="text-sm font-medium text-slate-900">控制台</span>
          </div>
          <SidebarNav onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
