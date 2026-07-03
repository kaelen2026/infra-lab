"use client";

import type { TimelinePostDTO } from "@infra/sdk";
import { Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { resolveImageUrl } from "@/lib/timeline-client";
import { cn } from "@/lib/utils";
import { ImageLightbox } from "./image-lightbox";

interface TimelinePostCardProps {
  post: TimelinePostDTO;
  pending: boolean;
  onRemove: (id: string) => void;
}

const formatter = new Intl.DateTimeFormat("zh-CN", {
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Grid column count that reads well for a given image count (1 big, 2×2, else 3-up). */
function gridCols(count: number): string {
  if (count === 1) return "grid-cols-1";
  if (count === 2 || count === 4) return "grid-cols-2";
  return "grid-cols-3";
}

/** One feed card: timestamp + delete, optional text, then the image grid. */
export function TimelinePostCard({ post, pending, onRemove }: TimelinePostCardProps) {
  // Index of the image the lightbox is open on, or null when closed.
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  return (
    <Card className={cn(pending && "opacity-50")}>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <time className="text-xs text-muted-foreground" dateTime={post.createdAt}>
            {formatter.format(new Date(post.createdAt))}
          </time>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onRemove(post.id)}
            disabled={pending}
            aria-label="删除"
            className="-mr-2 -mt-1 size-7 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>

        {post.text && <p className="whitespace-pre-wrap text-sm leading-relaxed">{post.text}</p>}

        {post.images.length > 0 && (
          <ul className={cn("grid gap-2", gridCols(post.images.length))}>
            {post.images.map((image, i) => (
              <li key={image.url} className="overflow-hidden rounded-lg border bg-muted">
                <button
                  type="button"
                  onClick={() => setViewerIndex(i)}
                  aria-label="查看大图"
                  className="block size-full cursor-zoom-in"
                >
                  <img
                    src={resolveImageUrl(image.url)}
                    alt="动态图片"
                    loading="lazy"
                    className="aspect-square size-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {viewerIndex !== null && (
        <ImageLightbox
          images={post.images}
          startIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </Card>
  );
}
