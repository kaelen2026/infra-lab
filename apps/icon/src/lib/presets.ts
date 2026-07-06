import type { IconConfig, IconShape } from "@/types/icon";
import { popularIconNames } from "./lucide";

// Curated background presets. Each carries a foreground color that reads well
// on it, applied to whichever fg mode is active (icon stroke or text fill).
export type StylePreset = {
  name: string;
  patch: Pick<IconConfig, "bgType" | "bgColor1" | "bgColor2" | "bgAngle">;
  fgColor: string;
};

export const stylePresets: StylePreset[] = [
  {
    name: "phosphor",
    patch: {
      bgType: "linear",
      bgColor1: "#1a1a1f",
      bgColor2: "#2e2e36",
      bgAngle: 135,
    },
    fgColor: "#4ade80",
  },
  {
    name: "midnight",
    patch: {
      bgType: "linear",
      bgColor1: "#0f172a",
      bgColor2: "#1e3a5f",
      bgAngle: 160,
    },
    fgColor: "#7dd3fc",
  },
  {
    name: "sunset",
    patch: {
      bgType: "linear",
      bgColor1: "#7c2d12",
      bgColor2: "#f59e0b",
      bgAngle: 25,
    },
    fgColor: "#fff7ed",
  },
  {
    name: "berry",
    patch: {
      bgType: "linear",
      bgColor1: "#4a044e",
      bgColor2: "#be185d",
      bgAngle: 135,
    },
    fgColor: "#fbcfe8",
  },
  {
    name: "ocean",
    patch: {
      bgType: "radial",
      bgColor1: "#0e7490",
      bgColor2: "#164e63",
      bgAngle: 0,
    },
    fgColor: "#cffafe",
  },
  {
    name: "forest",
    patch: {
      bgType: "linear",
      bgColor1: "#14532d",
      bgColor2: "#365314",
      bgAngle: 200,
    },
    fgColor: "#d9f99d",
  },
  {
    name: "lavender",
    patch: {
      bgType: "linear",
      bgColor1: "#6d28d9",
      bgColor2: "#a78bfa",
      bgAngle: 320,
    },
    fgColor: "#f5f3ff",
  },
  {
    name: "ember",
    patch: {
      bgType: "radial",
      bgColor1: "#dc2626",
      bgColor2: "#7f1d1d",
      bgAngle: 0,
    },
    fgColor: "#fef2f2",
  },
  {
    name: "paper",
    patch: {
      bgType: "solid",
      bgColor1: "#f5f5f4",
      bgColor2: "#f5f5f4",
      bgAngle: 0,
    },
    fgColor: "#292524",
  },
  {
    name: "slate",
    patch: {
      bgType: "solid",
      bgColor1: "#1e293b",
      bgColor2: "#1e293b",
      bgAngle: 0,
    },
    fgColor: "#e2e8f0",
  },
  {
    name: "gold",
    patch: {
      bgType: "linear",
      bgColor1: "#451a03",
      bgColor2: "#b45309",
      bgAngle: 45,
    },
    fgColor: "#fde68a",
  },
  {
    name: "aurora",
    patch: {
      bgType: "linear",
      bgColor1: "#042f2e",
      bgColor2: "#2dd4bf",
      bgAngle: 305,
    },
    fgColor: "#f0fdfa",
  },
];

/** Config patch applying a preset to both background and active foreground color. */
export function presetPatch(preset: StylePreset): Partial<IconConfig> {
  return {
    ...preset.patch,
    iconColor: preset.fgColor,
    textColor: preset.fgColor,
  };
}

const SHAPES: IconShape[] = ["rounded", "circle", "squircle", "square"];

function pick<T>(items: T[]): T {
  const item = items[Math.floor(Math.random() * items.length)];
  if (item === undefined) {
    throw new Error("Cannot pick from an empty list");
  }
  return item;
}

/** Random preset × random curated icon × random shape, as one config patch. */
export function randomStylePatch(): Partial<IconConfig> {
  return {
    ...presetPatch(pick(stylePresets)),
    fgMode: "icon",
    iconName: pick(popularIconNames),
    shape: pick(SHAPES),
  };
}
