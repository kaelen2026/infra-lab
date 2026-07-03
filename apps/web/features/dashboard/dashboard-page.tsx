"use client";

import { ListTodo } from "lucide-react";
import Link from "next/link";

import { AppNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { useRequireAuth, useSession } from "@/features/session";
import { DevicesCard } from "./components/devices-card";
import { LoginEventsCard } from "./components/login-events-card";
import { ProfileCard } from "./components/profile-card";
import { SessionCard } from "./components/session-card";
import { useAccountData } from "./use-account-data";

/**
 * Protected account dashboard. The session lives behind the API (cookie), so the
 * guard is client-side (see {@link useRequireAuth}).
 */
export default function DashboardPage() {
  const { user } = useSession();
  const { ready } = useRequireAuth();
  const { devices, events, loading, error } = useAccountData(ready);

  // Hold the layout (with nav) while resolving / redirecting, so there's no flash of content.
  if (!ready || !user) {
    return (
      <>
        <AppNav />
        <main className="mx-auto max-w-3xl px-4 py-10" />
      </>
    );
  }

  return (
    <>
      <AppNav />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-medium">账户</h1>
            <p className="mt-1 text-muted-foreground">你的资料、当前会话与登录记录。</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/todos">
              <ListTodo />
              待办
            </Link>
          </Button>
        </header>

        <div className="space-y-6">
          <ProfileCard user={user} />

          <div className="grid gap-6 md:grid-cols-2">
            <SessionCard />
            <DevicesCard devices={devices} loading={loading} />
          </div>

          <LoginEventsCard events={events} loading={loading} />

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </div>
      </main>
    </>
  );
}
