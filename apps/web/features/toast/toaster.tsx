"use client";

import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "./toast-provider";

/**
 * Renders the active toasts in a fixed, screen-reader-announced region (bottom-right,
 * stacked). Mount once, inside {@link ToastProvider}. Styling reuses the shared
 * design tokens so it matches light/dark like the rest of the app.
 */
export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <section
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
      aria-label="通知"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          aria-live="polite"
          className={cn(
            "pointer-events-auto flex w-full max-w-sm items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg",
            t.variant === "destructive"
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-border bg-background text-foreground",
          )}
        >
          <span className="leading-relaxed">{t.message}</span>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
            aria-label="关闭通知"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </section>
  );
}
