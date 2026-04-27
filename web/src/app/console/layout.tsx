"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth";
import { Navbar } from "@/components/layout/navbar";
import { ConsoleSidebar, ConsoleMobileNav } from "@/components/layout/console-sidebar";

export default function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login?redirect=/console");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <>
      <Navbar />
      <div className="flex flex-1">
        <ConsoleSidebar />
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          <div className="mb-4 lg:hidden">
            <ConsoleMobileNav />
          </div>
          {children}
        </main>
      </div>
    </>
  );
}
