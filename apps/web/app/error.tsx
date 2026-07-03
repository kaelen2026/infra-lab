"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";

/**
 * Route-level error boundary. Catches render/data errors thrown by any page under
 * the root layout, reports them through the telemetry seam, and offers a retry
 * (`reset` re-renders the segment). Digest-only in production — no stack shown to users.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("route_error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-[400px] space-y-4 text-center">
        <h1 className="font-serif text-2xl font-medium">出错了</h1>
        <p className="text-muted-foreground leading-relaxed">
          页面加载时发生错误，请重试。若问题持续，请稍后再来。
        </p>
        <Button onClick={reset}>重试</Button>
      </div>
    </main>
  );
}
