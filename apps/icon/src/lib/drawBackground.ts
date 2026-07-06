import type { IconConfig } from "@/types/icon";

export function drawBackground(ctx: CanvasRenderingContext2D, config: IconConfig, size: number) {
  const half = size / 2;
  if (config.bgType === "linear") {
    const rad = (config.bgAngle * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);
    const ext = half * (Math.abs(dx) + Math.abs(dy));
    const gradient = ctx.createLinearGradient(
      half - dx * ext,
      half - dy * ext,
      half + dx * ext,
      half + dy * ext,
    );
    gradient.addColorStop(0, config.bgColor1);
    gradient.addColorStop(1, config.bgColor2);
    ctx.fillStyle = gradient;
  } else if (config.bgType === "radial") {
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half * Math.SQRT2);
    gradient.addColorStop(0, config.bgColor1);
    gradient.addColorStop(1, config.bgColor2);
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = config.bgColor1;
  }
  ctx.fillRect(0, 0, size, size);
}
