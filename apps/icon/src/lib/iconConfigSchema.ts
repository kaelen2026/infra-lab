import { z } from "zod";
import type { PlatformId } from "@/modules/exporting/lib/exportPresets";
import { allPlatformIds } from "@/modules/exporting/lib/exportPresets";
import { defaultIconConfig, type IconConfig } from "@/types/icon";
import { lucideIconNames } from "./lucide";

function hexColor(fallback: string) {
  return z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .catch(fallback);
}

function clampedNumber(min: number, max: number, fallback: number) {
  return z
    .number()
    .finite()
    .transform((value) => Math.min(max, Math.max(min, value)))
    .catch(fallback);
}

function stringWithFallback(fallback: string, maxLength?: number) {
  return z
    .string()
    .catch(fallback)
    .transform((value) => (typeof maxLength === "number" ? value.slice(0, maxLength) : value));
}

const durableImageSchema = z
  .string()
  .refine((value) => value.startsWith("data:image/"))
  .nullable()
  .catch(null);

const iconNameSchema = z
  .string()
  .refine((value) => lucideIconNames.includes(value))
  .catch(defaultIconConfig.iconName);

const iconConfigObjectSchema = z.object({
  fgMode: z.enum(["image", "text", "icon", "emoji"]).catch(defaultIconConfig.fgMode),
  imageSrc: durableImageSchema,
  text: stringWithFallback(defaultIconConfig.text, 12),
  textColor: hexColor(defaultIconConfig.textColor),
  textFont: z.enum(["sans", "serif", "mono"]).catch(defaultIconConfig.textFont),
  iconName: iconNameSchema,
  iconColor: hexColor(defaultIconConfig.iconColor),
  iconStroke: clampedNumber(1, 3, defaultIconConfig.iconStroke),
  emoji: stringWithFallback(defaultIconConfig.emoji, 16),
  appName: stringWithFallback(defaultIconConfig.appName),
  bgType: z.enum(["solid", "linear", "radial"]).catch(defaultIconConfig.bgType),
  bgAngle: clampedNumber(0, 360, defaultIconConfig.bgAngle),
  bgColor1: hexColor(defaultIconConfig.bgColor1),
  bgColor2: hexColor(defaultIconConfig.bgColor2),
  shape: z.enum(["rounded", "circle", "squircle", "square"]).catch(defaultIconConfig.shape),
  scale: clampedNumber(20, 120, defaultIconConfig.scale),
  offsetX: clampedNumber(-100, 100, defaultIconConfig.offsetX),
  offsetY: clampedNumber(-100, 100, defaultIconConfig.offsetY),
  rotation: clampedNumber(-180, 180, defaultIconConfig.rotation),
});

export function parseIconConfigWithSchema(data: unknown): IconConfig | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  const raw = data as Record<string, unknown>;
  if (!Object.keys(defaultIconConfig).some((key) => key in raw)) {
    return null;
  }

  return iconConfigObjectSchema.parse({
    ...defaultIconConfig,
    ...raw,
  });
}

export function parsePlatformIdsWithSchema(data: unknown): PlatformId[] | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  const raw = (data as Record<string, unknown>).platforms;
  if (!Array.isArray(raw)) return null;
  const ids = allPlatformIds.filter((id) => raw.includes(id));
  return ids.length > 0 ? ids : null;
}
