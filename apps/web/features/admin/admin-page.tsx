"use client";

import type { AdminStatsDTO, AdminUserDTO } from "@infra/sdk";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useRequireAuth } from "@/features/session";
import { formatDateTime } from "@/lib/format";
import { useAdminAccess, useAdminStats, useAdminUsers } from "./use-admin";

/**
 * Protected admin console. Two gates, both necessarily client-side (the session
 * rides the API-origin HttpOnly cookie, so a web-origin middleware can't read it):
 * {@link useRequireAuth} for authentication, then {@link useAdminAccess} for the
 * admin allowlist. A non-admin sees a clear "no access" panel rather than a blank
 * redirect. The API enforces the same gate on every /admin/* request, so this is
 * UX, not the security boundary.
 */
export default function AdminPage() {
  const { ready } = useRequireAuth();
  const { isAdmin, loading: accessLoading } = useAdminAccess(ready);
  const authorized = ready && isAdmin;

  const { stats, loading: statsLoading } = useAdminStats(authorized);
  const { data: usersData, loading: usersLoading } = useAdminUsers(authorized);

  // Hold the layout while resolving auth / admin status, so there's no flash.
  if (!ready || accessLoading) {
    return (
      <>
        <AppNav />
        <main className="mx-auto max-w-3xl px-4 py-10" />
      </>
    );
  }

  if (!isAdmin) {
    return (
      <>
        <AppNav />
        <main className="mx-auto max-w-3xl px-4 py-10">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="size-4 text-destructive" />
                无权限访问
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                管理后台仅对管理员开放，当前账户没有访问权限。
              </p>
              <Button asChild variant="outline">
                <Link href="/">返回首页</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </>
    );
  }

  return (
    <>
      <AppNav />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <header className="mb-8">
          <h1 className="flex items-center gap-2 font-serif text-3xl font-medium">
            <ShieldCheck className="size-6 text-primary" />
            管理后台
          </h1>
          <p className="mt-1 text-muted-foreground">仅管理员可见:全站概览与用户列表。</p>
        </header>

        <div className="space-y-6">
          <StatsSection stats={stats} loading={statsLoading} />
          <UsersSection users={usersData?.users ?? null} loading={usersLoading} />
        </div>
      </main>
    </>
  );
}

// ── Stats ─────────────────────────────────────────────────────────────────────────
const STAT_TILES: ReadonlyArray<{ key: keyof AdminStatsDTO; label: string }> = [
  { key: "totalUsers", label: "用户总数" },
  { key: "totalTodos", label: "待办总数" },
  { key: "totalTimelinePosts", label: "动态总数" },
  { key: "loginsLast7d", label: "近 7 日登录" },
  { key: "failedLoginsLast7d", label: "近 7 日失败登录" },
];

function StatsSection({ stats, loading }: { stats: AdminStatsDTO | null; loading: boolean }) {
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {STAT_TILES.map((tile) => (
        <Card key={tile.key}>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">{tile.label}</p>
            {loading || !stats ? (
              <Skeleton className="mt-2 h-8 w-16" />
            ) : (
              <p className="mt-1 font-serif text-2xl font-medium tabular-nums">{stats[tile.key]}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

// ── Users ─────────────────────────────────────────────────────────────────────────
function UsersSection({ users, loading }: { users: AdminUserDTO[] | null; loading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">用户列表</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-4/5" />
          </div>
        ) : users && users.length > 0 ? (
          <ul className="divide-y divide-border/60">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                <div className="flex flex-col gap-0.5">
                  <span lang={u.displayName ? "zh" : "en"} className="text-sm">
                    {u.displayName ?? "未命名用户"}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{u.phoneMasked}</span>
                </div>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {formatDateTime(u.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">还没有用户。</p>
        )}
      </CardContent>
    </Card>
  );
}
