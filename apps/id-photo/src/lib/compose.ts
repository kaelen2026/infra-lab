// 把抠好的前景合成到纯色底,按规格输出精确像素尺寸。
// 有人脸几何时按头高占比缩放+居中;没有时退回 L1 的等比贴底排版。

import type { FaceGeometry } from "./face";
import type { BgColor, PhotoSpec } from "./specs";
import { BG_COLORS } from "./specs";

// 头顶距上边的留白占成品高度比例(经验值,QA 后可调)
const TOP_MARGIN_RATIO = 0.1;

async function toBitmap(cutout: ImageData): Promise<ImageBitmap> {
  return createImageBitmap(cutout);
}

function newCanvas(spec: PhotoSpec, bg: BgColor) {
  const canvas = document.createElement("canvas");
  canvas.width = spec.pxWidth;
  canvas.height = spec.pxHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法获取 2D canvas 上下文");
  ctx.fillStyle = BG_COLORS[bg].css;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
}

/**
 * 人脸感知排版:把 crown→chin 缩放到 spec.headHeightRatio×高度,
 * 人脸水平居中,头顶距上边 TOP_MARGIN_RATIO×高度。
 */
export async function composeFaceAware(
  cutout: ImageData,
  face: FaceGeometry,
  spec: PhotoSpec,
  bg: BgColor,
): Promise<HTMLCanvasElement> {
  const { canvas, ctx } = newCanvas(spec, bg);
  const bitmap = await toBitmap(cutout);

  const desiredHeadPx = spec.headHeightRatio * canvas.height;
  const scale = desiredHeadPx / face.headHeightPx;
  const topMargin = canvas.height * TOP_MARGIN_RATIO;

  // 让(centerX, crownY)落到输出的(宽/2, topMargin)
  const dx = canvas.width / 2 - face.centerX * scale;
  const dy = topMargin - face.crownY * scale;
  ctx.drawImage(bitmap, dx, dy, bitmap.width * scale, bitmap.height * scale);
  return canvas;
}

/** L1 兜底排版:等比 contain、底部对齐、顶部留白(无人脸时用)。 */
export async function composeContain(
  cutout: ImageData,
  spec: PhotoSpec,
  bg: BgColor,
): Promise<HTMLCanvasElement> {
  const { canvas, ctx } = newCanvas(spec, bg);
  const bitmap = await toBitmap(cutout);
  const margin = Math.round(canvas.height * 0.04);
  const scale = Math.min(canvas.width / bitmap.width, (canvas.height - margin) / bitmap.height);
  const drawW = bitmap.width * scale;
  const drawH = bitmap.height * scale;
  ctx.drawImage(bitmap, (canvas.width - drawW) / 2, canvas.height - drawH, drawW, drawH);
  return canvas;
}

export function compose(
  cutout: ImageData,
  spec: PhotoSpec,
  bg: BgColor,
  face: FaceGeometry | null,
): Promise<HTMLCanvasElement> {
  return face ? composeFaceAware(cutout, face, spec, bg) : composeContain(cutout, spec, bg);
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("导出失败"))), "image/png");
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
