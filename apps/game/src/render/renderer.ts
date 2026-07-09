// Canvas 命令式渲染:牌桌绒面、三家面板、桌面出牌堆、人类手牌。
// 只依赖引擎的只读数据 + 布局模块,不触碰 DOM 状态,便于按帧重画。

import { type Card, isJoker, isRed, rankLabel, suitSymbol } from "../engine/cards.js";
import type { GameState, Seat } from "../engine/game.js";
import type { SeatAction, Snapshot } from "../game/controller.js";
import { cardSize, humanCardLayout, type Viewport } from "./layout.js";

const SEAT_NAME = ["你", "右家", "左家"] as const;

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawFelt(ctx: CanvasRenderingContext2D, vp: Viewport): void {
  const g = ctx.createRadialGradient(
    vp.width / 2,
    vp.height * 0.42,
    60,
    vp.width / 2,
    vp.height * 0.42,
    Math.max(vp.width, vp.height) * 0.75,
  );
  g.addColorStop(0, "#1f7a4d");
  g.addColorStop(1, "#0c3b24");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vp.width, vp.height);
}

function drawFaceCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  card: Card,
  selected: boolean,
): void {
  roundRect(ctx, x, y, w, h, w * 0.12);
  ctx.fillStyle = "#fffdf7";
  ctx.fill();
  ctx.lineWidth = selected ? 3 : 1;
  ctx.strokeStyle = selected ? "#ffd24a" : "rgba(0,0,0,0.25)";
  ctx.stroke();

  const red = isRed(card);
  ctx.fillStyle = red ? "#c0261f" : "#1c1c22";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  if (isJoker(card)) {
    ctx.font = `${Math.round(w * 0.3)}px sans-serif`;
    const label = card.rank === 17 ? "大\n王" : "小\n王";
    label.split("\n").forEach((ch, i) => {
      ctx.fillText(ch, x + w * 0.12, y + h * 0.1 + i * w * 0.34);
    });
    ctx.font = `${Math.round(w * 0.42)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("🃏", x + w / 2, y + h * 0.52);
    return;
  }

  const label = rankLabel(card.rank);
  const sym = suitSymbol(card.suit);
  ctx.font = `bold ${Math.round(w * 0.34)}px sans-serif`;
  ctx.fillText(label, x + w * 0.1, y + h * 0.06);
  ctx.font = `${Math.round(w * 0.26)}px sans-serif`;
  ctx.fillText(sym, x + w * 0.1, y + h * 0.06 + w * 0.34);

  ctx.font = `bold ${Math.round(w * 0.6)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(sym, x + w / 2, y + h * 0.58);
}

function drawCardBack(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  roundRect(ctx, x, y, w, h, w * 0.12);
  ctx.fillStyle = "#2b4a8b";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();
  roundRect(ctx, x + w * 0.16, y + h * 0.12, w * 0.68, h * 0.76, w * 0.1);
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.stroke();
}

function roleLabel(state: GameState, seat: Seat): string {
  if (state.landlord === null) return "";
  return state.landlord === seat ? "地主" : "农民";
}

/** 画一家 AI 面板:名字/角色/剩余张数 + 背面牌堆。 */
function drawOpponent(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  seat: Seat,
  panelX: number,
  panelY: number,
): void {
  const count = state.hands[seat]?.length ?? 0;
  const isTurn = state.current === seat && state.phase !== "finished";
  const w = 128;
  const h = 58;
  roundRect(ctx, panelX, panelY, w, h, 12);
  ctx.fillStyle = isTurn ? "rgba(255,210,74,0.22)" : "rgba(0,0,0,0.32)";
  ctx.fill();
  ctx.strokeStyle = isTurn ? "#ffd24a" : "rgba(255,255,255,0.18)";
  ctx.lineWidth = isTurn ? 2 : 1;
  ctx.stroke();

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "#fff";
  ctx.font = "bold 16px sans-serif";
  const role = roleLabel(state, seat);
  ctx.fillText(`${SEAT_NAME[seat]}${role ? ` · ${role}` : ""}`, panelX + 12, panelY + 20);
  ctx.font = "14px sans-serif";
  ctx.fillStyle = "#d7e6dc";
  ctx.fillText(`剩 ${count} 张`, panelX + 12, panelY + 40);

  // 背面小牌堆
  const bw = 22;
  const bh = 30;
  const stack = Math.min(6, count);
  for (let i = 0; i < stack; i++) {
    drawCardBack(ctx, panelX + w - 46 + i * 4, panelY + h / 2 - bh / 2, bw, bh);
  }
}

/** 画桌面上某家最近一次动作(出的牌 or “不出”)。 */
function drawAction(
  ctx: CanvasRenderingContext2D,
  action: SeatAction | null,
  cx: number,
  cy: number,
): void {
  if (!action) return;
  if (action.kind === "pass") {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("不出", cx, cy);
    return;
  }
  const cards = action.cards ?? [];
  if (cards.length === 0) return;
  const w = 40;
  const h = Math.round(w * 1.4);
  const step = Math.min(w * 0.66, cards.length > 1 ? (220 - w) / (cards.length - 1) : 0);
  const total = w + step * (cards.length - 1);
  const startX = cx - total / 2;
  const y = cy - h / 2;
  cards.forEach((card, i) => {
    drawFaceCard(ctx, startX + i * step, y, w, h, card, false);
  });
}

export function render(ctx: CanvasRenderingContext2D, snap: Snapshot, vp: Viewport): void {
  const { state } = snap;
  drawFelt(ctx, vp);

  // AI 面板:右家(seat1)右侧、左家(seat2)左侧,置于 DOM 顶栏(标题/比分)之下避免重叠。
  drawOpponent(ctx, state, 1, vp.width - 148, 96);
  drawOpponent(ctx, state, 2, 20, 96);

  // 桌面出牌堆:三家各自靠近其方位。
  drawAction(ctx, snap.actions[2] ?? null, vp.width * 0.26, vp.height * 0.4);
  drawAction(ctx, snap.actions[1] ?? null, vp.width * 0.74, vp.height * 0.4);
  drawAction(ctx, snap.actions[0] ?? null, vp.width * 0.5, vp.height * 0.56);

  // 地主底牌(叫牌后亮出,置于顶部中央)。
  if (state.landlord !== null && state.bottom.length > 0) {
    const bw = 34;
    const bh = Math.round(bw * 1.4);
    const startX = vp.width / 2 - (bw * 3 + 12) / 2;
    state.bottom.forEach((card, i) => {
      drawFaceCard(ctx, startX + i * (bw + 6), 20, bw, bh, card, false);
    });
  }

  // 人类手牌。
  const hand = state.hands[0] ?? [];
  const rects = humanCardLayout(hand, snap.selected, vp);
  for (const r of rects) drawFaceCard(ctx, r.x, r.y, r.w, r.h, r.card, r.selected);

  // 轮到你:在手牌上方给个高亮提示条。
  if (state.current === 0 && state.phase === "playing") {
    const { h } = cardSize(vp);
    ctx.fillStyle = "#ffd24a";
    ctx.font = "bold 15px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("轮到你出牌", vp.width / 2, vp.height - h - 34);
  }
}
