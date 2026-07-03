import type { TimelinePostDTO } from "@infra/sdk";
import { Images } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TimelinePostCard } from "./timeline-post";

interface TimelineListProps {
  posts: TimelinePostDTO[] | null;
  loading: boolean;
  pendingIds: Set<string>;
  onRemove: (id: string) => void;
}

/** The feed body: skeleton while loading, an empty state, or the post cards. */
export function TimelineList({ posts, loading, pendingIds, onRemove }: TimelineListProps) {
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
    </div>
  );
}
