import { useEffect, useRef, useSyncExternalStore } from "react";
import { canPass, legalBids, validatePlay } from "../engine/game.js";
import type { GameController } from "../game/controller.js";
import { hitTest, humanCardLayout, type Viewport } from "../render/layout.js";
import { render } from "../render/renderer.js";

const SEAT_NAME = ["你", "右家", "左家"] as const;

export function App({ controller }: { controller: GameController }): React.JSX.Element {
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
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

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const rects = humanCardLayout(snap.state.hands[0] ?? [], snap.selected, vpRef.current);
    const card = hitTest(rects, e.clientX - rect.left, e.clientY - rect.top);
    if (card) controller.toggleCard(card.id);
  };

  const st = snap.state;
  const myBidTurn = snap.started && st.phase === "bidding" && st.current === 0;
  const myPlayTurn = st.phase === "playing" && st.current === 0;
  const selectedCards = (st.hands[0] ?? []).filter((c) => snap.selected.has(c.id));
  const canPlay = myPlayTurn && validatePlay(st, 0, selectedCards) !== null;
  const passOk = myPlayTurn && canPass(st);
  const finished = st.phase === "finished";
  const landlordWon = st.winner === st.landlord;

  return (
    <div className="fixed inset-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        className="block h-full w-full touch-none"
      />

      {/* 顶部状态条 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
        <div className="rounded-xl bg-black/35 px-3 py-2 text-white backdrop-blur-sm">
          <div className="text-sm font-bold tracking-wide">斗地主</div>
          {st.landlord !== null && (
            <div className="text-xs text-emerald-200">倍数 ×{st.multiplier}</div>
          )}
        </div>
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
        <div className="pointer-events-none absolute inset-x-0 top-20 flex justify-center">
          <div className="rounded-full bg-black/45 px-4 py-1.5 text-sm text-amber-200 backdrop-blur-sm">
            {snap.thinking ? "🤔 " : ""}
            {snap.message}
          </div>
        </div>
      )}

      {/* 叫地主控制 */}
      {myBidTurn && (
        <div className="absolute inset-x-0 bottom-44 flex justify-center gap-3">
          <Btn tone="ghost" onClick={() => controller.bid(0)}>
            不叫
          </Btn>
          {legalBids(st).map((v) => (
            <Btn key={v} tone="gold" onClick={() => controller.bid(v)}>
              {v} 分
            </Btn>
          ))}
        </div>
      )}

      {/* 出牌控制 */}
      {myPlayTurn && (
        <div className="absolute inset-x-0 bottom-44 flex justify-center gap-3">
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
        </div>
      )}

      {/* 开始 / 结算弹窗 */}
      {(!snap.started || finished) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm">
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
            <Btn tone="gold" className="mt-6 w-full" onClick={controller.start}>
              {finished ? "再来一局" : "开始游戏"}
            </Btn>
          </div>
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
