"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/console", label: "总览", icon: "📊" },
  { href: "/console/agents", label: "我的 Agent", icon: "🤖" },
  { href: "/console/keys", label: "API Key", icon: "🔑" },
  { href: "/console/usage/consumer", label: "消费明细", icon: "📉" },
  { href: "/console/usage/provider", label: "收入明细", icon: "📈" },
  { href: "/console/settings", label: "账户设置", icon: "⚙️" },
];

export function ConsoleSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r bg-gray-50/50">
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
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-blue-50 font-medium text-blue-600"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
              )}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
