"use client";

import { useMemo, useState } from "react";
import { lucideIconNames, lucideSvgDataUrl, popularIconNames, toKebab } from "@/lib/lucide";
import type { ForegroundMode, IconConfig, TextFont } from "@/types/icon";
import ImageUploader from "./ImageUploader";

const MODES: { value: ForegroundMode; label: string }[] = [
  { value: "image", label: "image" },
  { value: "text", label: "text" },
  { value: "icon", label: "icon" },
  { value: "emoji", label: "emoji" },
];

const POPULAR_EMOJI = [
  "🚀",
  "⚡",
  "🔥",
  "✨",
  "💎",
  "🎯",
  "🎨",
  "🎮",
  "🎵",
  "📷",
  "💬",
  "🛒",
  "📚",
  "☁️",
  "🌍",
  "🌙",
  "☀️",
  "🌈",
  "🍀",
  "☕",
  "💪",
  "🧠",
  "🤖",
  "👾",
];

const FONTS: { value: TextFont; label: string }[] = [
  { value: "sans", label: "sans" },
  { value: "serif", label: "serif" },
  { value: "mono", label: "mono" },
];

const GRID_LIMIT = 24;

type Props = {
  config: IconConfig;
  onChange: (patch: Partial<IconConfig>) => void;
};

export default function ForegroundPanel({ config, onChange }: Props) {
  const [query, setQuery] = useState("");

  const visibleIcons = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return popularIconNames;
    return lucideIconNames.filter((name) => toKebab(name).includes(q)).slice(0, GRID_LIMIT);
  }, [query]);

  return (
    <section className="space-y-3">
      <h2 className="text-[11px] tracking-[0.18em] text-text-faint">fg_mode</h2>
      <div className="grid grid-cols-4 gap-px border border-hairline bg-hairline">
        {MODES.map((mode) => {
          const active = config.fgMode === mode.value;
          return (
            <button
              key={mode.value}
              type="button"
              onClick={() => onChange({ fgMode: mode.value })}
              className={`px-2 py-3 text-[11px] whitespace-nowrap transition-colors sm:py-1.5 ${
                active ? "bg-panel-2 text-accent" : "bg-ink text-text-dim hover:text-text"
              }`}
            >
              {active ? `> ${mode.label}` : mode.label}
            </button>
          );
        })}
      </div>

      {config.fgMode === "image" && (
        <ImageUploader
          imageSrc={config.imageSrc}
          onImageChange={(src) => onChange({ imageSrc: src })}
        />
      )}

      {config.fgMode === "text" && (
        <div className="space-y-3">
          <input
            type="text"
            aria-label="text foreground"
            value={config.text}
            maxLength={12}
            onChange={(e) => onChange({ text: e.target.value })}
            placeholder="A"
            className="w-full rounded-sm border border-hairline bg-panel-2 px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
          />
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[11px] text-text-dim">
              <input
                type="color"
                value={config.textColor}
                onChange={(e) => onChange({ textColor: e.target.value })}
                className="h-7 w-7"
              />
              color
            </label>
            <div className="grid flex-1 grid-cols-3 gap-px border border-hairline bg-hairline">
              {FONTS.map((font) => (
                <button
                  key={font.value}
                  type="button"
                  onClick={() => onChange({ textFont: font.value })}
                  className={`px-2 py-1 text-[11px] transition-colors ${
                    config.textFont === font.value
                      ? "bg-panel-2 text-accent"
                      : "bg-ink text-text-dim hover:text-text"
                  }`}
                >
                  {font.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {config.fgMode === "emoji" && (
        <div className="space-y-3">
          <div className="grid grid-cols-6 gap-1">
            {POPULAR_EMOJI.map((emoji) => {
              const active = config.emoji === emoji;
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onChange({ emoji })}
                  className={`flex aspect-square items-center justify-center rounded-sm border text-base transition-colors ${
                    active
                      ? "border-accent bg-accent-dim"
                      : "border-hairline hover:border-hairline-bright"
                  }`}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
          <input
            type="text"
            aria-label="emoji foreground"
            value={config.emoji ?? ""}
            maxLength={16}
            onChange={(e) => onChange({ emoji: e.target.value })}
            placeholder="or paste any emoji"
            className="w-full rounded-sm border border-hairline bg-panel-2 px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent"
          />
          <p className="text-[10px] text-text-faint">
            rendered with your OS emoji font — exact style varies by platform
          </p>
        </div>
      )}

      {config.fgMode === "icon" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="text"
              aria-label="search icons"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search 1900+ icons…"
              className="min-h-11 min-w-0 flex-1 rounded-sm border border-hairline bg-panel-2 px-3 py-2 text-base text-text outline-none transition-colors focus:border-accent sm:min-h-0 sm:text-xs"
            />
            <input
              type="color"
              aria-label="icon color"
              value={config.iconColor}
              onChange={(e) => onChange({ iconColor: e.target.value })}
              className="h-11 w-11 shrink-0 sm:h-7 sm:w-7"
            />
          </div>
          {visibleIcons.length === 0 ? (
            <p className="text-[11px] text-text-faint">no icons match “{query}”</p>
          ) : (
            <div className="grid grid-cols-6 gap-1">
              {visibleIcons.map((name) => {
                // design-lint-disable-next-line hardcoded-color -- SVG data URLs need a concrete stroke color.
                const src = lucideSvgDataUrl(name, "#9d9da6");
                if (!src) return null;
                const active = config.iconName === name;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => onChange({ iconName: name })}
                    title={toKebab(name)}
                    className={`flex aspect-square items-center justify-center rounded-sm border p-1.5 transition-colors ${
                      active
                        ? "border-accent bg-accent-dim"
                        : "border-hairline hover:border-hairline-bright"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={toKebab(name)} className="h-4.5 w-4.5" />
                  </button>
                );
              })}
            </div>
          )}
          <label className="block space-y-1">
            <span className="flex justify-between text-[11px] text-text-dim">
              <span>stroke</span>
              <span className="tabular-nums text-accent">{config.iconStroke}</span>
            </span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.25}
              value={config.iconStroke}
              onChange={(e) => onChange({ iconStroke: Number(e.target.value) })}
              className="w-full"
            />
          </label>
          <p className="text-[10px] text-text-faint">
            selected: <span className="text-accent">{toKebab(config.iconName)}</span>
          </p>
        </div>
      )}
    </section>
  );
}
