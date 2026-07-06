"use client";

import { presetPatch, stylePresets } from "@/lib/presets";
import type { IconConfig } from "@/types/icon";

type Props = {
  config: IconConfig;
  onChange: (patch: Partial<IconConfig>) => void;
};

function presetCss(preset: (typeof stylePresets)[number]): string {
  const { bgType, bgColor1, bgColor2, bgAngle } = preset.patch;
  if (bgType === "linear") {
    return `linear-gradient(${bgAngle}deg, ${bgColor1}, ${bgColor2})`;
  }
  if (bgType === "radial") {
    return `radial-gradient(circle, ${bgColor1}, ${bgColor2})`;
  }
  return bgColor1;
}

export default function BackgroundPanel({ config, onChange }: Props) {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] tracking-[0.18em] text-text-faint">background</h2>
      <div className="flex flex-wrap gap-1.5">
        {stylePresets.map((preset) => {
          const active =
            config.bgColor1 === preset.patch.bgColor1 &&
            config.bgColor2 === preset.patch.bgColor2 &&
            config.bgType === preset.patch.bgType;
          return (
            <button
              key={preset.name}
              type="button"
              title={preset.name}
              onClick={() => onChange(presetPatch(preset))}
              className={`h-10 w-10 rounded-[3px] border transition-colors sm:h-6 sm:w-6 ${
                active ? "border-accent" : "border-hairline hover:border-hairline-bright"
              }`}
              style={{ background: presetCss(preset) }}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-px border border-hairline bg-hairline">
        {(["solid", "linear", "radial"] as const).map((type) => {
          const active = config.bgType === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onChange({ bgType: type })}
              className={`px-3 py-3 text-[11px] transition-colors sm:py-1.5 ${
                active ? "bg-panel-2 text-accent" : "bg-ink text-text-dim hover:text-text"
              }`}
            >
              {active ? `> ${type}` : type}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-[11px] text-text-dim">
          <input
            type="color"
            value={config.bgColor1}
            onChange={(e) => onChange({ bgColor1: e.target.value })}
            className="h-11 w-11 sm:h-7 sm:w-7"
          />
          color_1
        </label>
        <label
          className={`flex items-center gap-2 text-[11px] text-text-dim ${
            config.bgType === "solid" ? "pointer-events-none opacity-30" : ""
          }`}
        >
          <input
            type="color"
            value={config.bgColor2}
            onChange={(e) => onChange({ bgColor2: e.target.value })}
            className="h-11 w-11 sm:h-7 sm:w-7"
            disabled={config.bgType === "solid"}
          />
          color_2
        </label>
      </div>
      {config.bgType === "linear" && (
        <label className="block space-y-1">
          <span className="flex justify-between text-[11px] text-text-dim">
            <span>angle</span>
            <span className="tabular-nums text-accent">{config.bgAngle}°</span>
          </span>
          <input
            type="range"
            min={0}
            max={360}
            step={5}
            value={config.bgAngle}
            onChange={(e) => onChange({ bgAngle: Number(e.target.value) })}
            className="w-full"
          />
        </label>
      )}
    </section>
  );
}
