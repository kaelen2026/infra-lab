"use client";

import { useEffect, useRef } from "react";
import { drawIcon } from "@/lib/renderIcon";
import type { IconConfig } from "@/types/icon";
import PreviewWall from "./PreviewWall";

const LOGICAL_SIZE = 1024;

type Props = {
  config: IconConfig;
};

export default function IconPreview({ config }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let cancelled = false;
    // Paint offscreen first: drawIcon awaits image loads mid-draw, so painting
    // the visible canvas directly would let an older config finish after a
    // newer one and leave a stale foreground on screen.
    const buffer = document.createElement("canvas");
    buffer.width = LOGICAL_SIZE;
    buffer.height = LOGICAL_SIZE;
    const bufferCtx = buffer.getContext("2d");
    if (!bufferCtx) return;
    drawIcon(bufferCtx, config, LOGICAL_SIZE).then(() => {
      if (cancelled) return;
      ctx.clearRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);
      ctx.drawImage(buffer, 0, 0);
    });
    return () => {
      cancelled = true;
    };
  }, [config]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4 py-5 sm:gap-4 sm:px-8 sm:py-8">
        <div
          className="flex aspect-square max-h-[20rem] w-full min-h-0 max-w-80 items-center justify-center border border-hairline p-4 sm:max-h-[26rem] sm:max-w-105 sm:p-5 lg:w-auto lg:max-w-full lg:flex-1"
          style={{
            backgroundImage: "repeating-conic-gradient(var(--panel-2) 0% 25%, var(--panel) 0% 50%)",
            backgroundSize: "16px 16px",
          }}
        >
          <canvas
            ref={canvasRef}
            width={LOGICAL_SIZE}
            height={LOGICAL_SIZE}
            className="max-h-full max-w-full"
          />
        </div>
        <p className="shrink-0 text-[11px] tracking-[0.12em] text-text-faint">
          1024 × 1024 · live render
        </p>
      </div>
      <div className="min-w-0 shrink-0 overflow-hidden border-t border-hairline">
        <PreviewWall config={config} />
      </div>
    </div>
  );
}
