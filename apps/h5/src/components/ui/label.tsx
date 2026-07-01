import type { LabelHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  // biome-ignore lint/a11y/noLabelWithoutControl: every caller passes `htmlFor` (see phone/code steps).
  return <label className={cn("text-sm font-medium text-foreground", className)} {...props} />;
}
