import type { TimelinePostDTO } from "@infra/sdk";
import { Images, Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TimelinePostCard } from "./timeline-post";

interface TimelineListProps {
  posts: TimelinePostDTO[] | null;
  loading: boolean;
  /** True when an older page exists; renders the sentinel that loads it. */
  hasMore: boolean;
  /** True while an older page is being appended. */
  loadingMore: boolean;
  /** True when the last page append failed; the sentinel offers a manual retry. */
  loadMoreError: boolean;
  pendingIds: Set<string>;
  onRemove: (id: string) => void;
  onLoadMore: () => void;
}

/**
 * The feed body: skeleton while loading, an empty state, or the post cards.
 * While `hasMore`, a sentinel row after the last card fires `onLoadMore` as it
 * scrolls into view (with a margin, so the next page starts before the edge).
 */
export function TimelineList({
  posts,
  loading,
  hasMore,
  loadingMore,
  loadMoreError,
  pendingIds,
  onRemove,
  onLoadMore,
}: TimelineListProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    // After a failed append we stop auto-firing: the observer only re-fires on an
    // intersection *change*, so it would sit stuck. The manual retry below drives it.
    if (!hasMore || loadMoreError || !sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMoreError, onLoadMore]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  if (!posts || posts.length === 0) {
    return (
      <Card>
        <CardContent>
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Images className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">还没有动态，在上面发布第一条吧。</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <TimelinePostCard
          key={post.id}
          post={post}
          pending={pendingIds.has(post.id)}
          onRemove={onRemove}
        />
      ))}
      {hasMore && (
        <div ref={sentinelRef} className="flex items-center justify-center gap-2 py-4">
          {loadMoreError ? (
            <button
              type="button"
              onClick={onLoadMore}
              className="text-sm font-medium text-destructive underline underline-offset-4"
            >
              加载更多动态失败，点击重试
            </button>
          ) : (
            <>
              {loadingMore && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              <p className="text-sm text-muted-foreground">正在加载更多动态…</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
