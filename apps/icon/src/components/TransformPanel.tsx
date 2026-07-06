"use client";

import type { IconConfig } from "@/types/icon";
import { defaultIconConfig } from "@/types/icon";

type SliderKey = "scale" | "offsetX" | "offsetY" | "rotation";

const SLIDERS: { key: SliderKey; label: string; min: number; max: number }[] = [
  { key: "scale", label: "scale", min: 20, max: 120 },
  { key: "offsetX", label: "offset_x", min: -100, max: 100 },
  { key: "offsetY", label: "offset_y", min: -100, max: 100 },
  { key: "rotation", label: "rotation", min: -180, max: 180 },
];

type Props = {
  config: IconConfig;
  onChange: (patch: Partial<IconConfig>) => void;
};

export default function TransformPanel({ config, onChange }: Props) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] tracking-[0.18em] text-text-faint">transform</h2>
        <button
          type="button"
          onClick={() =>
            onChange({
              scale: defaultIconConfig.scale,
              offsetX: defaultIconConfig.offsetX,
              offsetY: defaultIconConfig.offsetY,
              rotation: defaultIconConfig.rotation,
            })
          }
          className="text-[11px] text-text-faint transition-colors hover:text-accent"
        >
          reset
        </button>
      </div>
      {SLIDERS.map((slider) => (
        <label key={slider.key} className="block space-y-1">
          <span className="flex justify-between text-[11px] text-text-dim">
            <span>{slider.label}</span>
            <span className="tabular-nums text-accent">{config[slider.key]}</span>
          </span>
          <input
            type="range"
            min={slider.min}
            max={slider.max}
            value={config[slider.key]}
            onChange={(e) => onChange({ [slider.key]: Number(e.target.value) })}
            className="w-full"
          />
        </label>
      ))}
    </section>
  );
}
