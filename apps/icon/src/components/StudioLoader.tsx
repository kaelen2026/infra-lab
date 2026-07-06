"use client";

import dynamic from "next/dynamic";
import type { PlatformId } from "@/modules/exporting/lib/exportPresets";

// The editor is pure client state (canvas + localStorage). Skipping SSR lets
// IconStudio read the stored design in its useState initializer, so the saved
// design appears in the first paint with no hydration mismatch.
const IconStudio = dynamic(() => import("@/components/IconStudio"), {
  ssr: false,
});

export default function StudioLoader({ initialPlatforms }: { initialPlatforms?: PlatformId[] }) {
  return initialPlatforms ? <IconStudio initialPlatforms={initialPlatforms} /> : <IconStudio />;
}
