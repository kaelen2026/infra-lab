import type { HTMLAttributes, ImgHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Avatar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted",
        className,
      )}
      {...props}
    />
  );
}

/** Absolutely covers the fallback when a real image loads. */
export function AvatarImage({
  className,
  alt = "",
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <img
      className={cn("absolute inset-0 size-full object-cover", className)}
      alt={alt}
      {...props}
    />
  );
}

export function AvatarFallback({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("font-medium text-muted-foreground", className)} {...props} />;
}
