import { icons } from "lucide";

type IconNode = [tag: string, attrs: Record<string, string | number>][];

const iconMap = icons as unknown as Record<string, IconNode>;

export const lucideIconNames = Object.keys(iconMap);

/** Curated subset shown in the picker's default grid and used by the randomizer. */
export const popularIconNames = [
  "Rocket",
  "Zap",
  "Star",
  "Heart",
  "Flame",
  "Sparkles",
  "Camera",
  "Music",
  "MessageCircle",
  "ShoppingCart",
  "Gamepad2",
  "BookOpen",
  "Cloud",
  "Code",
  "Compass",
  "Globe",
  "Leaf",
  "Coffee",
  "Dumbbell",
  "Wallet",
  "Bell",
  "Calendar",
  "MapPin",
  "Send",
];

/** PascalCase → kebab-case for search/display ("ArrowRight" → "arrow-right") */
export function toKebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function serializeChildren(node: IconNode): string {
  return node
    .map(([tag, attrs]) => {
      const attrString = Object.entries(attrs)
        .map(([key, value]) => `${key}="${value}"`)
        .join(" ");
      return `<${tag} ${attrString}/>`;
    })
    .join("");
}

export function buildLucideSvg(name: string, color: string, strokeWidth = 2): string | null {
  const node = iconMap[name];
  if (!node) return null;
  // Rasterize at 512px for crisp canvas drawing; stroke units stay in the 24px viewBox
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 24 24" ` +
    `fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">` +
    serializeChildren(node) +
    `</svg>`
  );
}

export function lucideSvgDataUrl(name: string, color: string, strokeWidth = 2): string | null {
  const svg = buildLucideSvg(name, color, strokeWidth);
  if (!svg) return null;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
