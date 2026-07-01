/**
 * Canonical design tokens for all four clients (web / ios / android / harmony).
 *
 * The values here are the SINGLE SOURCE OF TRUTH for color and shape. They are
 * lifted verbatim from `apps/web`'s `globals.css` — web is the reference design,
 * so its warm-paper / clay-accent palette is canonical. Every other client's
 * color resources are GENERATED from this file (see `generate.ts`); none of them
 * may hand-pick their own brand color again.
 *
 * Colors are stored in OKLCH (the space web authored in). The web emitter prints
 * `oklch(...)` strings unchanged; native emitters (Swift / Android XML / ArkTS
 * JSON) convert to sRGB hex via {@link oklchToHex}.
 */

/** An OKLCH color: lightness 0–1, chroma ≥0, hue in degrees. */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

const oklch = (l: number, c: number, h: number): Oklch => ({ l, c, h });

/**
 * The full semantic role palette, per theme. Mirrors web's `:root` / `.dark`
 * exactly so the generated CSS can replace those hand-written blocks 1:1.
 */
export interface Palette {
  background: Oklch;
  foreground: Oklch;
  card: Oklch;
  cardForeground: Oklch;
  popover: Oklch;
  popoverForeground: Oklch;
  primary: Oklch;
  /** Pressed / gradient-deep variant of primary. Derived; not a web CSS var. */
  primaryDeep: Oklch;
  primaryForeground: Oklch;
  secondary: Oklch;
  secondaryForeground: Oklch;
  muted: Oklch;
  mutedForeground: Oklch;
  accent: Oklch;
  accentForeground: Oklch;
  destructive: Oklch;
  destructiveForeground: Oklch;
  border: Oklch;
  input: Oklch;
  ring: Oklch;
}

/** Light = warm off-white paper, clay accent. (web `:root`) */
export const light: Palette = {
  background: oklch(0.985, 0.008, 90),
  foreground: oklch(0.26, 0.012, 60),
  card: oklch(0.998, 0.004, 90),
  cardForeground: oklch(0.26, 0.012, 60),
  popover: oklch(1, 0, 0),
  popoverForeground: oklch(0.26, 0.012, 60),
  primary: oklch(0.56, 0.15, 45),
  primaryDeep: oklch(0.44, 0.16, 42),
  primaryForeground: oklch(0.99, 0.005, 90),
  secondary: oklch(0.95, 0.008, 85),
  secondaryForeground: oklch(0.3, 0.012, 60),
  muted: oklch(0.95, 0.008, 85),
  mutedForeground: oklch(0.52, 0.012, 60),
  accent: oklch(0.93, 0.012, 70),
  accentForeground: oklch(0.3, 0.012, 60),
  destructive: oklch(0.55, 0.18, 27),
  destructiveForeground: oklch(0.99, 0.005, 90),
  border: oklch(0.9, 0.008, 85),
  input: oklch(0.9, 0.008, 85),
  ring: oklch(0.56, 0.15, 45),
};

/** Dark = warm charcoal, lighter clay accent. (web `.dark`) */
export const dark: Palette = {
  background: oklch(0.18, 0.006, 70),
  foreground: oklch(0.93, 0.006, 80),
  card: oklch(0.215, 0.007, 70),
  cardForeground: oklch(0.93, 0.006, 80),
  popover: oklch(0.215, 0.007, 70),
  popoverForeground: oklch(0.93, 0.006, 80),
  primary: oklch(0.7, 0.13, 48),
  primaryDeep: oklch(0.56, 0.15, 45),
  primaryForeground: oklch(0.2, 0.02, 50),
  secondary: oklch(0.27, 0.008, 70),
  secondaryForeground: oklch(0.93, 0.006, 80),
  muted: oklch(0.27, 0.008, 70),
  mutedForeground: oklch(0.71, 0.01, 75),
  accent: oklch(0.3, 0.012, 60),
  accentForeground: oklch(0.95, 0.006, 80),
  destructive: oklch(0.58, 0.16, 25),
  destructiveForeground: oklch(0.95, 0.006, 80),
  border: oklch(0.3, 0.008, 70),
  input: oklch(0.3, 0.008, 70),
  ring: oklch(0.7, 0.13, 48),
};

/** Shape + type tokens shared across clients. */
export const shape = {
  /** Base corner radius in px (web `--radius: 0.625rem`). */
  radiusPx: 10,
} as const;

export const tokens = { light, dark, shape } as const;

// ── OKLCH → sRGB hex (Björn Ottosson's transform) ────────────────────────────
// Native targets need sRGB hex; this keeps the conversion in one audited place
// instead of asking each platform to eyeball a color.

const cube = (x: number) => x * x * x;

function gammaEncode(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, v));
}

const toByte = (c: number) =>
  Math.round(gammaEncode(c) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();

/** Convert an OKLCH color to an sRGB `#RRGGBB` string (clamped to gamut). */
export function oklchToHex({ l, c, h }: Oklch): string {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const lc = cube(l_);
  const mc = cube(m_);
  const sc = cube(s_);

  const r = 4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc;
  const g = -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc;
  const bl = -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc;

  return `#${toByte(r)}${toByte(g)}${toByte(bl)}`;
}

/** Format an OKLCH color as a CSS `oklch(...)` string (web emitter). */
export function oklchToCss({ l, c, h }: Oklch): string {
  // Match web's existing formatting: bare numbers, space-separated.
  return `oklch(${l} ${c} ${h})`;
}
