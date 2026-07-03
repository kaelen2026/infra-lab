"use client";

import type { AuthUser, TimelinePostDTO } from "@infra/sdk";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/features/session";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { resolveImageUrl } from "@/lib/timeline-client";
import { cn } from "@/lib/utils";
import { ImageLightbox } from "./image-lightbox";

interface TimelinePostCardProps {
  post: TimelinePostDTO;
  pending: boolean;
  onRemove: (id: string) => void;
}

/** Avatar monogram: first glyph of a name, else the last two phone digits. */
function monogram(user: AuthUser | null): string {
  const name = user?.displayName?.trim();
  if (name) return (Array.from(name)[0] ?? "·").toUpperCase();
  const digits = user?.phone.replace(/\D/g, "") ?? "";
  return digits.slice(-2) || "··";
}

/** Grid column count that reads well for a given image count (1 big, 2×2, else 3-up). */
function gridCols(count: number): string {
  if (count === 1) return "grid-cols-1";
  if (count === 2 || count === 4) return "grid-cols-2";
  return "grid-cols-3";
}

/**
 * One feed card. Content leads: an identity row (avatar + name, quiet relative
 * time, overflow menu), then the text, then the image grid. Delete lives behind
 * the ⋯ menu so the card face carries no destructive affordance.
 */
export function TimelinePostCard({ post, pending, onRemove }: TimelinePostCardProps) {
  const { user } = useSession();
  // Index of the image the lightbox is open on, or null when closed.
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  return (
    <Card className={cn("gap-0 py-4", pending && "opacity-50")}>
      <CardContent className="space-y-2.5 px-4">
        <div className="flex items-center gap-2.5">
          <Avatar className="size-9">
            {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
            <AvatarFallback className="text-xs">{monogram(user)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium leading-tight">
              {user?.displayName ?? "未命名用户"}
            </p>
            <time
              className="text-xs text-muted-foreground"
              dateTime={post.createdAt}
              title={formatDateTime(post.createdAt)}
            >
              {formatRelativeTime(post.createdAt)}
            </time>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={pending}
                aria-label="更多操作"
                className="-mr-1 size-7 text-muted-foreground"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onClick={() => onRemove(post.id)}>
                <Trash2 />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {post.text && (
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{post.text}</p>
        )}

        {post.images.length > 0 && (
          <ul className={cn("grid gap-1.5", gridCols(post.images.length))}>
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
