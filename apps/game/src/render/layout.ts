// 人类手牌的几何布局与命中测试。渲染与指针拾取共用同一套矩形,避免视觉/点击错位。

import type { Card } from "../engine/cards.js";

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

export interface CardRect {
  readonly card: Card;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly selected: boolean;
}

export const CARD_ASPECT = 1.4;
const SELECT_RAISE = 22;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** 手牌卡片尺寸(随视口自适应)。 */
export function cardSize(vp: Viewport): { w: number; h: number } {
  const w = clamp(Math.round(vp.width * 0.062), 44, 78);
  return { w, h: Math.round(w * CARD_ASPECT) };
}

/** 计算人类手牌每张卡的矩形(含被选中抬起的偏移)。 */
export function humanCardLayout(
  cards: readonly Card[],
  selected: ReadonlySet<number>,
  vp: Viewport,
): CardRect[] {
  const n = cards.length;
  if (n === 0) return [];
  const { w, h } = cardSize(vp);
  const available = vp.width - 40;
  const step = n <= 1 ? 0 : Math.min(w * 0.62, (available - w) / (n - 1));
  const totalWidth = w + step * (n - 1);
  const startX = (vp.width - totalWidth) / 2;
  const baseY = vp.height - h - 24;
  return cards.map((card, i) => {
    const isSel = selected.has(card.id);
    return {
      card,
      x: Math.round(startX + i * step),
      y: baseY - (isSel ? SELECT_RAISE : 0),
      w,
      h,
      selected: isSel,
    };
  });
}

/** 命中测试:返回被点中的最上层卡片(叠放时右侧/后画的在上)。 */
export function hitTest(rects: readonly CardRect[], px: number, py: number): Card | null {
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return r.card;
  }
  return null;
}
