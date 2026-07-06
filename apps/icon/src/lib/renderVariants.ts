export type RenderVariant =
  | "masked"
  | "fullBleed"
  | "adaptiveForeground"
  | "adaptiveBackground"
  | "maskable"
  | "harmonyForeground"
  | "monochrome"
  | "iosDark"
  | "iosTinted";

export type RenderVariantSpec = {
  clip: boolean;
  background: boolean;
  foreground: boolean;
  fgScale: number;
  monochrome?: boolean;
  grayscale?: boolean;
};

const VARIANTS: Record<RenderVariant, RenderVariantSpec> = {
  masked: { clip: true, background: true, foreground: true, fgScale: 1 },
  fullBleed: { clip: false, background: true, foreground: true, fgScale: 1 },
  adaptiveForeground: {
    clip: false,
    background: false,
    foreground: true,
    fgScale: 66 / 108,
  },
  adaptiveBackground: {
    clip: false,
    background: true,
    foreground: false,
    fgScale: 1,
  },
  maskable: { clip: false, background: true, foreground: true, fgScale: 0.8 },
  harmonyForeground: {
    clip: false,
    background: false,
    foreground: true,
    fgScale: 672 / 1024,
  },
  monochrome: {
    clip: false,
    background: false,
    foreground: true,
    fgScale: 66 / 108,
    monochrome: true,
  },
  iosDark: { clip: false, background: false, foreground: true, fgScale: 1 },
  iosTinted: {
    clip: false,
    background: false,
    foreground: true,
    fgScale: 1,
    grayscale: true,
  },
};

export function getRenderVariantSpec(variant: RenderVariant): RenderVariantSpec {
  return VARIANTS[variant];
}
