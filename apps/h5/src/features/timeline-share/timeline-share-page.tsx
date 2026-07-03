import { COPY } from "@infra/design";
import { timelineAppLink } from "@infra/shared";
import { ExternalLink } from "lucide-react";
import { useEffect } from "react";
import { useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime } from "@/lib/format";
import { resolveImageUrl } from "@/lib/timeline-client";
import { useSharedPost } from "./use-shared-post";

/**
 * Public share landing (`/t/:id`) for a single timeline post. No session gate:
 * anyone with the link can view that one post. A sticky footer offers "在 app 中
 * 查看", which deep-links into the native app via the shared `infralab://` scheme.
 */
export function TimelineSharePage() {
  const { id } = useParams<{ id: string }>();
  const state = useSharedPost(id);

  useEffect(() => {
    document.title = COPY.timelineShare.documentTitle;
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-md items-center gap-2.5 px-4">
          <span className="size-2 rounded-full bg-primary" aria-hidden />
          <span className="font-serif text-lg font-medium tracking-tight">infra-lab</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-28 pt-6">
        {state.status === "loading" && (
          <div className="grid place-items-center py-24" aria-live="polite">
            <Spinner />
            <p className="mt-3 text-sm text-muted-foreground">{COPY.timelineShare.loading}</p>
          </div>
        )}

        {state.status === "error" && (
          <p
            role="alert"
            className="mt-24 rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground"
          >
            {state.message}
          </p>
        )}

        {state.status === "ready" && (
          <article className="space-y-4">
            <time className="block text-xs text-muted-foreground">
              {formatDateTime(state.post.createdAt)}
            </time>

            {state.post.text && (
              <p className="whitespace-pre-wrap break-words text-base leading-relaxed">
                {state.post.text}
              </p>
            )}

            {state.post.images.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {state.post.images.map((image) => (
                  <img
                    key={image.url}
                    src={resolveImageUrl(image.url)}
                    alt=""
                    loading="lazy"
                    className="aspect-square w-full rounded-lg border border-border object-cover"
                  />
                ))}
              </div>
            )}
          </article>
        )}
      </main>

      {state.status === "ready" && (
        <footer className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto max-w-md px-4 py-3">
            {/* Anchor (not a JS redirect) so a long-press / middle-click still works
                and the browser handles the custom scheme natively. */}
            <a href={timelineAppLink(state.post.id)}>
              <Button size="lg" className="w-full">
                <ExternalLink />
                {COPY.timelineShare.openInApp}
              </Button>
            </a>
          </div>
        </footer>
      )}
    </div>
  );
}
