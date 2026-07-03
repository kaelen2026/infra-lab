"use client";

import { AppNav } from "@/components/app-nav";
import { useRequireAuth } from "@/features/session";
import { ComposeTimeline } from "./components/compose-timeline";
import { TimelineList } from "./components/timeline-list";
import { useTimeline } from "./use-timeline";

/**
 * Protected timeline feed. Like the todo list, the session lives behind the API
 * (cookie), so the guard is client-side (see {@link useRequireAuth}).
 */
export default function TimelinePage() {
  const { ready } = useRequireAuth();
  const { posts, loading, error, publishing, pendingIds, publish, remove } = useTimeline(ready);

  // Hold the layout (with nav) while resolving / redirecting, so there's no flash.
  if (!ready) {
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
        <header className="mb-8">
          <h1 className="font-serif text-3xl font-medium">动态</h1>
          <p className="mt-1 text-muted-foreground">分享文字与图片，按用户隔离的个人动态流。</p>
        </header>

        <div className="space-y-6">
          <ComposeTimeline onPublish={publish} busy={publishing} />

          <TimelineList posts={posts} loading={loading} pendingIds={pendingIds} onRemove={remove} />

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
