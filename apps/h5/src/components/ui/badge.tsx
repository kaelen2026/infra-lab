import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type Variant = "default" | "outline" | "success" | "destructive";

const variants: Record<Variant, string> = {
  default: "border-transparent bg-primary text-primary-foreground",
  outline: "border-border text-foreground",
  success: "border-transparent bg-primary/15 text-primary",
  destructive: "border-transparent bg-destructive/15 text-destructive",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
