// 相纸排版:把成品证件照平铺到 6 寸相纸(6×4in @ 300dpi),自动选朝向使张数最多,
// 居中网格 + 细裁切线。纯前端,导出 PNG / 浏览器打印。

const DPI = 300;
const LONG = 6 * DPI; // 1800
const SHORT = 4 * DPI; // 1200
const GAP = 18; // 张间距(px)
const MARGIN = 30; // 相纸边距(px)

export interface SheetLayout {
  cols: number;
  rows: number;
  count: number;
  sheetW: number;
  sheetH: number;
}

function fit(sheetW: number, sheetH: number, pw: number, ph: number): SheetLayout {
  const cols = Math.max(0, Math.floor((sheetW - 2 * MARGIN + GAP) / (pw + GAP)));
  const rows = Math.max(0, Math.floor((sheetH - 2 * MARGIN + GAP) / (ph + GAP)));
  return { cols, rows, count: cols * rows, sheetW, sheetH };
}

/** 选张数更多的朝向(并列时取横向)。 */
export function planSheet(pw: number, ph: number): SheetLayout {
  const landscape = fit(LONG, SHORT, pw, ph);
  const portrait = fit(SHORT, LONG, pw, ph);
  return landscape.count >= portrait.count ? landscape : portrait;
}

/** 把 photo 平铺到相纸 canvas,返回 { canvas, layout }。 */
export function composeSheet(photo: HTMLCanvasElement): {
  canvas: HTMLCanvasElement;
  layout: SheetLayout;
} {
  const pw = photo.width;
  const ph = photo.height;
  const layout = planSheet(pw, ph);

  const canvas = document.createElement("canvas");
  canvas.width = layout.sheetW;
  canvas.height = layout.sheetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法获取 2D canvas 上下文");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const gridW = layout.cols * pw + (layout.cols - 1) * GAP;
  const gridH = layout.rows * ph + (layout.rows - 1) * GAP;
  const startX = (canvas.width - gridW) / 2;
  const startY = (canvas.height - gridH) / 2;

  ctx.imageSmoothingQuality = "high";
  ctx.strokeStyle = "#d0d0d0";
  ctx.lineWidth = 1;
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      const x = startX + c * (pw + GAP);
      const y = startY + r * (ph + GAP);
      ctx.drawImage(photo, x, y, pw, ph);
      ctx.strokeRect(x + 0.5, y + 0.5, pw, ph); // 细裁切线
    }
  }
  return { canvas, layout };
}
