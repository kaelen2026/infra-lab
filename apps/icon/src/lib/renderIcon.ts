import type { IconConfig, TextFont } from "@/types/icon";
import { drawBackground } from "./drawBackground";
import { traceShapePath } from "./drawShape";
import { lucideSvgDataUrl } from "./lucide";
import { createRenderCanvas, encodeCanvasPng } from "./renderCanvas";
import { getRenderVariantSpec, type RenderVariant } from "./renderVariants";

export type { RenderVariant } from "./renderVariants";

const imageCache = new Map<string, HTMLImageElement>();

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Crude cap: icon recolors generate many data-URL entries
      if (imageCache.size > 100) imageCache.clear();
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

/** Translate to icon center (with offset) and apply rotation; caller must save/restore. */
function applyTransform(ctx: CanvasRenderingContext2D, config: IconConfig, size: number) {
  // offset range -100..100 maps to -size/2..size/2
  const dx = (config.offsetX / 100) * (size / 2);
  const dy = (config.offsetY / 100) * (size / 2);
  ctx.translate(size / 2 + dx, size / 2 + dy);
  ctx.rotate((config.rotation * Math.PI) / 180);
}

function drawImageForeground(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  config: IconConfig,
  size: number,
) {
  const naturalW = img.naturalWidth || size;
  const naturalH = img.naturalHeight || size;
  // scale = percentage of canvas the image's larger dimension occupies
  const target = (config.scale / 100) * size;
  const ratio = target / Math.max(naturalW, naturalH);
  const drawW = naturalW * ratio;
  const drawH = naturalH * ratio;

  ctx.save();
  applyTransform(ctx, config, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

const FONT_STACKS: Record<TextFont, string> = {
  sans: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "Menlo, Consolas, 'Liberation Mono', monospace",
};

function drawTextForeground(ctx: CanvasRenderingContext2D, config: IconConfig, size: number) {
  const text = config.text.trim();
  if (!text) return;
  const target = (config.scale / 100) * size;
  const family = FONT_STACKS[config.textFont];

  // Start with font size = target box, shrink to fit width if needed
  let fontSize = target;
  ctx.font = `700 ${fontSize}px ${family}`;
  const width = ctx.measureText(text).width;
  if (width > target) {
    fontSize *= target / width;
  }

  ctx.save();
  applyTransform(ctx, config, size);
  ctx.font = `700 ${fontSize}px ${family}`;
  ctx.fillStyle = config.textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  // Optically center using the actual glyph bounding box
  const metrics = ctx.measureText(text);
  const yOffset = (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
  ctx.fillText(text, 0, yOffset);
  ctx.restore();
}

const EMOJI_FONT_STACK = "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";

function drawEmojiForeground(ctx: CanvasRenderingContext2D, config: IconConfig, size: number) {
  // ?? guards configs created before the emoji field existed (e.g. HMR state)
  const emoji = (config.emoji ?? "").trim();
  if (!emoji) return;
  const target = (config.scale / 100) * size;

  // Emoji glyphs are roughly square; shrink only if measurement says otherwise
  let fontSize = target;
  ctx.font = `${fontSize}px ${EMOJI_FONT_STACK}`;
  const width = ctx.measureText(emoji).width;
  if (width > target) {
    fontSize *= target / width;
  }

  ctx.save();
  applyTransform(ctx, config, size);
  ctx.font = `${fontSize}px ${EMOJI_FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const metrics = ctx.measureText(emoji);
  const yOffset = (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
  ctx.fillText(emoji, 0, yOffset);
  ctx.restore();
}

async function drawForeground(ctx: CanvasRenderingContext2D, config: IconConfig, size: number) {
  if (config.fgMode === "text") {
    drawTextForeground(ctx, config, size);
    return;
  }
  if (config.fgMode === "emoji") {
    drawEmojiForeground(ctx, config, size);
    return;
  }

  let src: string | null = null;
  if (config.fgMode === "image") {
    src = config.imageSrc;
  } else {
    src = lucideSvgDataUrl(config.iconName, config.iconColor, config.iconStroke);
  }
  if (!src) return;

  try {
    const img = await loadImage(src);
    drawImageForeground(ctx, img, config, size);
  } catch {
    // Background still renders if the foreground fails to load
  }
}

/**
 * Draws the full icon (mask + background + image) onto an existing 2D context.
 * Shared by the live preview canvas and the offscreen export renderer.
 */
export async function drawIcon(
  ctx: CanvasRenderingContext2D,
  config: IconConfig,
  size: number,
  variant: RenderVariant = "masked",
): Promise<void> {
  const spec = getRenderVariantSpec(variant);
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  if (spec.clip) {
    traceShapePath(ctx, config.shape, size);
    ctx.clip();
  }
  if (spec.background) drawBackground(ctx, config, size);
  if (spec.foreground) {
    // Shrink scale AND offsets so the composition stays inside the safe zone
    const fgConfig: IconConfig =
      spec.fgScale === 1
        ? config
        : {
            ...config,
            scale: config.scale * spec.fgScale,
            offsetX: config.offsetX * spec.fgScale,
            offsetY: config.offsetY * spec.fgScale,
          };
    await drawForeground(ctx, fgConfig, size);
    if (spec.monochrome) {
      // source-in keeps only the foreground's alpha and paints it white;
      // composite mode is reverted by the restore below
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
    }
    if (spec.grayscale) {
      // Pixel-loop instead of ctx.filter for deterministic output everywhere
      const image = ctx.getImageData(0, 0, size, size);
      const px = image.data;
      for (let i = 0; i < px.length; i += 4) {
        // Rec. 709 luma weights
        const y = 0.2126 * (px[i] ?? 0) + 0.7152 * (px[i + 1] ?? 0) + 0.0722 * (px[i + 2] ?? 0);
        px[i] = y;
        px[i + 1] = y;
        px[i + 2] = y;
      }
      ctx.putImageData(image, 0, 0);
    }
  }
  ctx.restore();
}

/** Small renders for the context preview wall (returns a data URL for <img>). */
export async function renderIconDataUrl(
  config: IconConfig,
  size: number,
  variant: RenderVariant = "masked",
): Promise<string> {
  const { canvas, ctx } = createRenderCanvas(size);
  await drawIcon(ctx, config, size, variant);
  return canvas.toDataURL("image/png");
}

export async function renderIcon(
  config: IconConfig,
  size: number,
  variant: RenderVariant = "masked",
): Promise<Blob> {
  const { canvas, ctx } = createRenderCanvas(size);
  await drawIcon(ctx, config, size, variant);
  return encodeCanvasPng(canvas);
}
