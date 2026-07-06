"use client";

import { useEffect, useMemo, useState } from "react";
import { renderIconDataUrl } from "@/lib/renderIcon";
import { generateConfigVariations } from "@/lib/variations";
import type { IconConfig } from "@/types/icon";

/* eslint-disable @next/next/no-img-element */

type Props = {
  config: IconConfig;
  onApply: (config: IconConfig) => void;
};

export default function VariationPanel({ config, onApply }: Props) {
  const variations = useMemo(() => generateConfigVariations(config), [config]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      variations.map(async (variation) => [
        variation.id,
        await renderIconDataUrl(variation.config, 96),
      ]),
    ).then((entries) => {
      if (cancelled) return;
      setThumbs(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [variations]);

  return (
    <section className="space-y-3">
      <h2 className="text-[11px] tracking-[0.18em] text-text-faint">variations</h2>
      <div className="grid grid-cols-3 gap-1.5">
        {variations.map((variation) => (
          <button
            key={variation.id}
            type="button"
            onClick={() => onApply(variation.config)}
            className="flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-sm border border-hairline bg-ink p-2 text-[10px] text-text-dim transition-colors hover:border-hairline-bright hover:text-text"
            title={`apply ${variation.label} variation`}
          >
            {thumbs[variation.id] && (
              <img src={thumbs[variation.id]} alt="" className="h-12 w-12 rounded-[22%]" />
            )}
            <span className="max-w-full truncate">{variation.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
