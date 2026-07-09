import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { BackgroundMusic } from "../audio/music.js";
import { type Card, countByRank, rankLabel } from "../engine/cards.js";
import { comboLabel, identify } from "../engine/combos.js";
import { canPass, legalBids, validatePlay } from "../engine/game.js";
import type { GameController } from "../game/controller.js";
import { hitTest, humanCardLayout, type Viewport } from "../render/layout.js";
import { render } from "../render/renderer.js";

const SEAT_NAME = ["你", "右家", "左家"] as const;

export function App({
  controller,
  music,
}: {
  controller: GameController;
  music: BackgroundMusic;
}): React.JSX.Element {
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [musicOn, setMusicOn] = useState(true);

  const toggleMusic = () => {
    const next = !musicOn;
    setMusicOn(next);
    music.setEnabled(next);
  };
  const startGame = () => {
    music.setEnabled(musicOn); // 首个用户手势:解锁 / 恢复音频
    controller.start();
  };
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vpRef = useRef<Viewport>({ width: 0, height: 0 });
  const snapRef = useRef(snap);
  snapRef.current = snap;

  // 视口尺寸变化时重设 canvas 背衬(含 DPR)并按最新快照重画。
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      vpRef.current = { width: w, height: h };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render(ctx, snapRef.current, vpRef.current);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => observer.disconnect();
  }, []);

  // 快照变化时重画棋盘。
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) render(ctx, snap, vpRef.current);
  }, [snap]);

  // 划动“涂选”:按下起点定方向(点未选中→选,点已选中→消),
  // 拖过的每张牌刷成同一状态;单击即退化为切换。自动识别牌型由下方指示条实时显示。
  const drag = useRef<{ mode: "select" | "deselect"; done: Set<number> } | null>(null);

  const cardAt = (e: React.PointerEvent<HTMLCanvasElement>): Card | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const rects = humanCardLayout(snap.state.hands[0] ?? [], snap.selected, vpRef.current);
    return hitTest(rects, e.clientX - rect.left, e.clientY - rect.top);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const card = cardAt(e);
    if (!card) return;
    const mode: "select" | "deselect" = snap.selected.has(card.id) ? "deselect" : "select";
    drag.current = { mode, done: new Set([card.id]) };
    canvasRef.current?.setPointerCapture(e.pointerId);
    controller.setCardSelected(card.id, mode === "select");
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const state = drag.current;
    if (!state) return;
    const card = cardAt(e);
    if (!card || state.done.has(card.id)) return;
    state.done.add(card.id);
    controller.setCardSelected(card.id, state.mode === "select");
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drag.current = null;
    canvasRef.current?.releasePointerCapture(e.pointerId);
  };

  const st = snap.state;
  const myBidTurn = snap.started && st.phase === "bidding" && st.current === 0;
  const myPlayTurn = st.phase === "playing" && st.current === 0;
  const selectedCards = (st.hands[0] ?? []).filter((c) => snap.selected.has(c.id));
  const canPlay = myPlayTurn && validatePlay(st, 0, selectedCards) !== null;
  const passOk = myPlayTurn && canPass(st);
  const finished = st.phase === "finished";
  const landlordWon = st.winner === st.landlord;

  // 记牌器:各点数尚未打出的张数(= 仍在三家手上的牌),叫地主阶段前不显示。
  const showCounter = snap.started && st.phase !== "bidding";
  const remaining = countByRank([
    ...(st.hands[0] ?? []),
    ...(st.hands[1] ?? []),
    ...(st.hands[2] ?? []),
  ]);

  // 自动识别当前选牌的牌型,实时反馈。
  const selCombo = myPlayTurn && selectedCards.length > 0 ? identify(selectedCards) : null;
  let comboText: string | null = null;
  if (myPlayTurn && selectedCards.length > 0) {
    if (!selCombo) comboText = "不成牌型";
    else comboText = canPlay ? comboLabel(selCombo.type) : `${comboLabel(selCombo.type)} · 压不过`;
  }

  return (
    <div className="fixed inset-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="block h-full w-full touch-none"
      />

      {/* 顶部状态条 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-3">
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-black/35 px-3 py-2 text-white backdrop-blur-sm">
            <div className="text-sm font-bold tracking-wide">斗地主</div>
            {st.landlord !== null && (
              <div className="text-xs text-emerald-200">倍数 ×{st.multiplier}</div>
            )}
          </div>
          <button
            type="button"
            onClick={toggleMusic}
            aria-label={musicOn ? "关闭背景音乐" : "开启背景音乐"}
            className="pointer-events-auto rounded-xl bg-black/35 px-3 py-2 text-lg leading-none backdrop-blur-sm transition hover:bg-black/50"
          >
            {musicOn ? "🔊" : "🔇"}
          </button>
        </div>

        {showCounter ? (
          <div className="flex items-start gap-2">
            <CardCounter remaining={remaining} />
            <LandlordPlays landlord={st.landlord} plays={snap.landlordPlays} />
          </div>
        ) : (
          <div />
        )}
        <div className="flex gap-2">
          {[0, 1, 2].map((seat) => (
            <div key={seat} className="rounded-lg bg-black/35 px-2.5 py-1.5 text-center text-white">
              <div className="text-[11px] text-emerald-100">{SEAT_NAME[seat]}</div>
              <div className="text-sm font-semibold tabular-nums">{st.scores[seat]}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 消息提示 */}
      {snap.message && snap.started && (
        <div className="pointer-events-none absolute inset-x-0 top-28 flex justify-center">
          <div className="rounded-full bg-black/45 px-4 py-1.5 text-sm text-amber-200 backdrop-blur-sm">
            {snap.thinking ? "🤔 " : ""}
            {snap.message}
          </div>
        </div>
      )}

      {/* 指示条:实时识别的牌型 + 回合倒计时 */}
      {(comboText || snap.countdown > 0) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-60 flex justify-center gap-2">
          {comboText && (
            <div
              className={`rounded-full px-3 py-1 text-sm font-bold ${
                canPlay ? "bg-emerald-500/85 text-white" : "bg-black/55 text-slate-300"
              }`}
            >
              {comboText}
            </div>
          )}
          {snap.countdown > 0 && (
            <div
              className={`rounded-full px-3 py-1 text-sm font-bold tabular-nums ${
                snap.countdown <= 5 ? "bg-red-500/85 text-white" : "bg-black/45 text-amber-200"
              }`}
            >
              ⏱ {snap.countdown}s
            </div>
          )}
        </div>
      )}

      {/* 底部控制行:托管时只留“取消托管”,否则按回合给出叫分 / 出牌 + “托管” */}
      {snap.started && !finished && (
        <div className="absolute inset-x-0 bottom-44 flex flex-wrap items-center justify-center gap-3">
          {snap.hosting ? (
            <Btn tone="gold" onClick={controller.toggleHosting}>
              取消托管
            </Btn>
          ) : (
            <>
              {myBidTurn && (
                <>
                  <Btn tone="ghost" onClick={() => controller.bid(0)}>
                    不叫
                  </Btn>
                  {legalBids(st).map((v) => (
                    <Btn key={v} tone="gold" onClick={() => controller.bid(v)}>
                      {v} 分
                    </Btn>
                  ))}
                </>
              )}
              {myPlayTurn && (
                <>
                  <Btn tone="ghost" onClick={controller.hint}>
                    提示
                  </Btn>
                  <Btn tone="ghost" disabled={!passOk} onClick={controller.pass}>
                    不出
                  </Btn>
                  {snap.selected.size > 0 && (
                    <Btn tone="ghost" onClick={controller.clearSelection}>
                      重选
                    </Btn>
                  )}
                  <Btn tone="gold" disabled={!canPlay} onClick={controller.play}>
                    出牌
                  </Btn>
                </>
              )}
              <Btn tone="ghost" onClick={controller.toggleHosting}>
                托管
              </Btn>
            </>
          )}
        </div>
      )}

      {/* 开始 / 结算弹窗 */}
      {(!snap.started || finished) && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="w-72 rounded-2xl bg-slate-900/90 p-6 text-center text-white shadow-2xl ring-1 ring-white/10">
            {finished ? (
              <>
                <div className="text-2xl font-bold text-amber-300">
                  {landlordWon ? "地主获胜 🏆" : "农民获胜 🎉"}
                </div>
                <div className="mt-1 text-sm text-slate-300">本局倍数 ×{st.multiplier}</div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                  {[0, 1, 2].map((seat) => (
                    <div key={seat} className="rounded-lg bg-white/5 py-2">
                      <div className="text-xs text-slate-400">{SEAT_NAME[seat]}</div>
                      <div className="font-semibold tabular-nums">{st.scores[seat]}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-amber-300">斗地主</div>
                <div className="mt-2 text-sm text-slate-300">
                  你 vs 两名 AI · 叫地主、出牌、炸弹、飞机一应俱全
                </div>
              </>
            )}
            <Btn tone="gold" className="mt-6 w-full" onClick={startGame}>
              {finished ? "再来一局" : "开始游戏"}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

const COUNTER_RANKS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17] as const;

function counterLabel(rank: number): string {
  if (rank === 16) return "小";
  if (rank === 17) return "大";
  return rankLabel(rank);
}

function CardCounter({ remaining }: { remaining: Map<number, number> }): React.JSX.Element {
  return (
    <div className="pointer-events-none rounded-xl bg-black/40 px-2 py-1.5 backdrop-blur-sm">
      <div className="flex items-end gap-[3px]">
        {COUNTER_RANKS.map((r) => {
          const n = remaining.get(r) ?? 0;
          return (
            <div key={r} className="flex w-5 flex-col items-center leading-none">
              <span className="text-[10px] font-semibold text-amber-200">{counterLabel(r)}</span>
              <span
                className={`text-xs font-bold tabular-nums ${n === 0 ? "text-slate-600" : "text-white"}`}
              >
                {n}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LandlordPlays({
  landlord,
  plays,
}: {
  landlord: number | null;
  plays: readonly (readonly Card[])[];
}): React.JSX.Element {
  const name = landlord === null ? "" : SEAT_NAME[landlord];
  return (
    <div className="pointer-events-auto w-56 rounded-xl bg-black/40 px-2 py-1 backdrop-blur-sm">
      <div className="text-[10px] font-semibold text-amber-200">
        地主出牌{name ? ` · ${name}` : ""}
      </div>
      {plays.length === 0 ? (
        <div className="text-[11px] text-slate-500">暂无</div>
      ) : (
        <div className="flex gap-1 overflow-x-auto whitespace-nowrap pb-0.5">
          {plays.map((play) => (
            <span
              key={play.map((c) => c.id).join(",")}
              className="shrink-0 rounded bg-white/10 px-1 text-[11px] font-semibold text-white"
            >
              {play.map((c) => counterLabel(c.rank)).join(" ")}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Btn({
  children,
  onClick,
  disabled,
  tone,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone: "gold" | "ghost";
  className?: string;
}): React.JSX.Element {
  const base =
    "pointer-events-auto select-none rounded-full px-6 py-2.5 text-sm font-semibold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40";
  const tones = {
    gold: "bg-amber-400 text-slate-900 shadow-lg hover:bg-amber-300",
    ghost: "bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/20",
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`${base} ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
}
