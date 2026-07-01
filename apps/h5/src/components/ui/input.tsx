import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/** `text-base` (16px) is deliberate — anything smaller makes iOS Safari zoom on focus. */
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-12 w-full rounded-lg border border-input bg-transparent px-3.5 text-base text-foreground transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
