"use client";

import { useEffect, useState } from "react";
import { renderIconDataUrl } from "@/lib/renderIcon";
import type { IconConfig } from "@/types/icon";

/* eslint-disable @next/next/no-img-element */

type Props = {
  config: IconConfig;
};

export default function PreviewWall({ config }: Props) {
  // square render: platforms apply their own masks (iOS rounded, Android circle)
  const [squareSrc, setSquareSrc] = useState<string | null>(null);
  // shaped render: what actually ships in favicon / PWA manifest files
  const [shapedSrc, setShapedSrc] = useState<string | null>(null);
  // harmony layered render: background + safe-zone foreground, stacked in CSS
  const [harmonyBgSrc, setHarmonyBgSrc] = useState<string | null>(null);
  const [harmonyFgSrc, setHarmonyFgSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      renderIconDataUrl({ ...config, shape: "square" }, 256),
      renderIconDataUrl(config, 256),
      renderIconDataUrl(config, 256, "adaptiveBackground"),
      renderIconDataUrl(config, 256, "harmonyForeground"),
    ]).then(([square, shaped, harmonyBg, harmonyFg]) => {
      if (cancelled) return;
      setSquareSrc(square);
      setShapedSrc(shaped);
      setHarmonyBgSrc(harmonyBg);
      setHarmonyFgSrc(harmonyFg);
    });
    return () => {
      cancelled = true;
    };
  }, [config]);

  const name = config.appName.trim() || "my-app";

  return (
    <div className="flex w-full max-w-full min-w-0 gap-px overflow-x-auto bg-hairline sm:grid sm:grid-cols-5 sm:overflow-visible">
      {/* iOS home screen */}
      <figure className="flex min-w-32 shrink-0 flex-col items-center justify-between gap-3 bg-ink px-3 pb-2.5 pt-5 sm:min-w-0">
        <span className="flex flex-col items-center gap-1.5">
          {squareSrc && <img src={squareSrc} alt="" className="h-14 w-14 rounded-[22.37%]" />}
          <span className="max-w-20 truncate text-[10px] text-text-dim">{name}</span>
        </span>
        <figcaption className="text-[10px] tracking-[0.15em] text-text-faint">ios</figcaption>
      </figure>

      {/* Android adaptive */}
      <figure className="flex min-w-32 shrink-0 flex-col items-center justify-between gap-3 bg-ink px-3 pb-2.5 pt-5 sm:min-w-0">
        <span className="flex flex-col items-center gap-1.5">
          {squareSrc && <img src={squareSrc} alt="" className="h-14 w-14 rounded-full" />}
          <span className="max-w-20 truncate text-[10px] text-text-dim">{name}</span>
        </span>
        <figcaption className="text-[10px] tracking-[0.15em] text-text-faint">android</figcaption>
      </figure>

      {/* HarmonyOS home screen: layered icon under the system mask */}
      <figure className="flex min-w-32 shrink-0 flex-col items-center justify-between gap-3 bg-ink px-3 pb-2.5 pt-5 sm:min-w-0">
        <span className="flex flex-col items-center gap-1.5">
          {harmonyBgSrc && harmonyFgSrc && (
            <span className="relative h-14 w-14 overflow-hidden rounded-[25%]">
              <img src={harmonyBgSrc} alt="" className="absolute inset-0 h-full w-full" />
              <img src={harmonyFgSrc} alt="" className="absolute inset-0 h-full w-full" />
            </span>
          )}
          <span className="max-w-20 truncate text-[10px] text-text-dim">{name}</span>
        </span>
        <figcaption className="text-[10px] tracking-[0.15em] text-text-faint">harmony</figcaption>
      </figure>

      {/* Browser tab */}
      <figure className="flex min-w-32 shrink-0 flex-col items-center justify-between gap-3 bg-ink px-3 pb-2.5 pt-5 sm:min-w-0">
        <span className="flex w-full max-w-36 items-center gap-2 rounded-t-md border border-b-0 border-hairline bg-panel-2 px-2.5 py-2">
          {shapedSrc && <img src={shapedSrc} alt="" className="h-4 w-4" />}
          <span className="min-w-0 flex-1 truncate text-[10px] text-text-dim">{name}</span>
          <span className="text-[10px] text-text-faint">×</span>
        </span>
        <figcaption className="text-[10px] tracking-[0.15em] text-text-faint">tab</figcaption>
      </figure>

      {/* PWA install prompt */}
      <figure className="flex min-w-40 shrink-0 flex-col items-center justify-between gap-3 bg-ink px-3 pb-2.5 pt-5 sm:min-w-0">
        <span className="flex w-full max-w-40 items-center gap-2.5 rounded-md border border-hairline bg-panel-2 px-2.5 py-2">
          {shapedSrc && <img src={shapedSrc} alt="" className="h-8 w-8 shrink-0" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[10px] text-text">{name}</span>
            <span className="block text-[9px] text-text-faint">localhost:3000</span>
          </span>
          <span className="text-[10px] text-accent">install</span>
        </span>
        <figcaption className="text-[10px] tracking-[0.15em] text-text-faint">pwa</figcaption>
      </figure>
    </div>
  );
}
