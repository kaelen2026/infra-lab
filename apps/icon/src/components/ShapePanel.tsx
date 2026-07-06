"use client";

import type { IconConfig, IconShape } from "@/types/icon";

const SHAPES: { value: IconShape; label: string; radiusClass: string }[] = [
  { value: "square", label: "square", radiusClass: "rounded-none" },
  { value: "rounded", label: "rounded", radiusClass: "rounded-md" },
  { value: "circle", label: "circle", radiusClass: "rounded-full" },
  { value: "squircle", label: "squircle", radiusClass: "rounded-[38%]" },
];

type Props = {
  config: IconConfig;
  onChange: (patch: Partial<IconConfig>) => void;
};

export default function ShapePanel({ config, onChange }: Props) {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] tracking-[0.18em] text-text-faint">shape</h2>
      <div className="grid grid-cols-4 gap-1.5">
        {SHAPES.map((shape) => {
          const active = config.shape === shape.value;
          return (
            <button
              key={shape.value}
              type="button"
              onClick={() => onChange({ shape: shape.value })}
              className={`flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-sm border p-2 transition-colors sm:min-h-0 ${
                active
                  ? "border-accent bg-accent-dim"
                  : "border-hairline hover:border-hairline-bright"
              }`}
              title={shape.label}
            >
              <span
                className={`h-6 w-6 ${shape.radiusClass} ${active ? "bg-accent" : "bg-text-faint"}`}
                aria-hidden
              />
              <span className={`text-[9px] ${active ? "text-accent" : "text-text-faint"}`}>
                {shape.label}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
