import type { IconShape } from "@/types/icon";

export function traceShapePath(ctx: CanvasRenderingContext2D, shape: IconShape, size: number) {
  const half = size / 2;
  ctx.beginPath();
  switch (shape) {
    case "square":
      ctx.rect(0, 0, size, size);
      break;
    case "rounded": {
      const radius = size * 0.225;
      ctx.roundRect(0, 0, size, size, radius);
      break;
    }
    case "circle":
      ctx.arc(half, half, half, 0, Math.PI * 2);
      break;
    case "squircle": {
      const n = 5;
      const steps = 128;
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        const cos = Math.cos(t);
        const sin = Math.sin(t);
        const x = half + half * Math.sign(cos) * Math.abs(cos) ** (2 / n);
        const y = half + half * Math.sign(sin) * Math.abs(sin) ** (2 / n);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    }
  }
}
