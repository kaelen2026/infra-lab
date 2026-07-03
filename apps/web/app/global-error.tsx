"use client";

import { useEffect } from "react";

import { logger } from "@/lib/logger";

/**
 * Last-resort boundary for errors thrown in the root layout itself. It REPLACES the
 * layout, so it must render its own `<html>`/`<body>`. Kept dependency-free (no
 * providers, no theme) because the failure may be in the provider tree. Normal page
 * errors are handled by the nicer `error.tsx`; this only fires when that can't.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("global_error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: 400, textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 500 }}>应用出错了</h1>
          <p style={{ opacity: 0.7, lineHeight: 1.6 }}>发生了意外错误，请刷新页面重试。</p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "0.5rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid currentColor",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            重试
          </button>
        </div>
      </body>
    </html>
  );
}
