"use client";

import type { TimelineImage } from "@infra/sdk";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Image from "next/image";
import { type TouchEvent, useCallback, useEffect, useRef, useState } from "react";

import { resolveImageUrl } from "@/lib/timeline-client";
import { cn } from "@/lib/utils";
import { clampIndex, resolveSwipe, stepIndex } from "../image-gallery-nav";

interface ImageLightboxProps {
  images: TimelineImage[];
  /** Index of the tapped image the viewer opens on. */
  startIndex: number;
  onClose: () => void;
}

/**
 * Fullscreen photo viewer for a post's images: tap a thumbnail to open, swipe
 * left/right (or arrow keys / on-screen arrows) to move between images, swipe
 * down / Esc / backdrop-tap to close. The large image reuses the same
 * `/uploads/…` url as the thumbnail — no separate fetch, no backend change.
 */
export function ImageLightbox({ images, startIndex, onClose }: ImageLightboxProps) {
  const count = images.length;
  const [index, setIndex] = useState(() => clampIndex(startIndex, count));
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const go = useCallback(
    (direction: 1 | -1) => {
      setIndex((current) => stepIndex(current, count, direction));
    },
    [count],
  );

  // Keyboard nav + Esc, and lock body scroll while the viewer is open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [go, onClose]);

  function handleTouchStart(e: TouchEvent) {
    const touch = e.touches[0];
    if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchEnd(e: TouchEvent) {
    const start = touchStart.current;
    const touch = e.changedTouches[0];
    touchStart.current = null;
    if (!start || !touch) return;
    const outcome = resolveSwipe({ dx: touch.clientX - start.x, dy: touch.clientY - start.y });
    if (outcome === "close") onClose();
    else if (outcome === "next") go(1);
    else if (outcome === "prev") go(-1);
  }

  const current = images[index];
  if (!current) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="图片查看"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Backdrop: a real button so click/tap outside the image closes, keyboard-accessible. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭图片查看"
        className="absolute inset-0 size-full cursor-zoom-out"
      />

      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
        className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <X className="size-5" />
      </button>

      {count > 1 && (
        <span className="absolute top-4 left-1/2 -translate-x-1/2 text-sm text-white/80">
          {index + 1} / {count}
        </span>
      )}

      {/* This wrapper lifts the image above the absolute backdrop; a tap on it is a no-op. */}
      <div className="relative h-[90vh] w-[92vw]">
        <Image
          src={resolveImageUrl(current.url)}
          alt="动态图片"
          fill
          unoptimized
          sizes="92vw"
          className="object-contain"
        />
      </div>

      {count > 1 && (
        <>
          <NavButton side="left" disabled={index === 0} onClick={() => go(-1)} />
          <NavButton side="right" disabled={index === count - 1} onClick={() => go(1)} />
        </>
      )}
    </div>
  );
}

function NavButton({
  side,
  disabled,
  onClick,
}: {
  side: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "上一张" : "下一张"}
      className={cn(
        "absolute top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-30 sm:flex",
        "size-10",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      <Icon className="size-6" />
    </button>
  );
}
