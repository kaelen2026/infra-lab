// 游戏控制器:桥接纯引擎与 React/canvas。持有可变的对局状态 + 人类选牌,
// 用定时器驱动 AI 回合(带思考延时便于观看),并以不可变快照对外发布供订阅。

import { chooseBid, chooseMove, hintPlays } from "../engine/ai.js";
import type { Card } from "../engine/cards.js";
import { rankLabel } from "../engine/cards.js";
import { type Combo, comboLabel } from "../engine/combos.js";
import {
  applyBid,
  applyPass,
  applyPlay,
  canPass,
  deal,
  type GameState,
  type Seat,
  validatePlay,
} from "../engine/game.js";

export const HUMAN_SEAT: Seat = 0;
const AI_DELAY_MS = 850;

/** 每个座位本轮最近一次动作,用于在桌面呈现出牌堆 / "不出"。 */
export interface SeatAction {
  readonly kind: "play" | "pass";
  readonly cards?: readonly Card[];
  readonly combo?: Combo;
}

export interface Snapshot {
  readonly started: boolean;
  readonly state: GameState;
  readonly selected: ReadonlySet<number>;
  readonly thinking: boolean;
  readonly actions: readonly (SeatAction | null)[];
  readonly message: string;
}

type Listener = () => void;

const SEAT_NAME = ["你", "右家", "左家"] as const;

export class GameController {
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private hintIndex = 0;

  private started = false;
  private state: GameState = deal(HUMAN_SEAT);
  private selected = new Set<number>();
  private actions: (SeatAction | null)[] = [null, null, null];
  private message = "";
  private firstBidder: Seat = HUMAN_SEAT;
  private snap: Snapshot = this.buildSnapshot();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): Snapshot => this.snap;

  /** 开始/重开一局(比分跨局保留)。 */
  start = (): void => {
    this.clearTimer();
    this.state = deal(this.firstBidder, this.state.scores);
    this.selected.clear();
    this.actions = [null, null, null];
    this.hintIndex = 0;
    this.started = true;
    this.message = `${SEAT_NAME[this.firstBidder]}先叫地主`;
    this.emit();
    this.scheduleAi();
  };

  toggleCard = (id: number): void => {
    if (!this.isHumanPlayTurn()) return;
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
    this.hintIndex = 0;
    this.emit();
  };

  clearSelection = (): void => {
    this.selected.clear();
    this.emit();
  };

  bid = (value: number): void => {
    if (this.state.phase !== "bidding" || this.state.current !== HUMAN_SEAT) return;
    this.message = value > 0 ? `你叫${value}分` : "你不叫";
    this.advanceBid(value);
    this.emit();
    this.scheduleAi();
  };

  play = (): void => {
    if (!this.isHumanPlayTurn()) return;
    const cards = this.selectedCards();
    if (!validatePlay(this.state, HUMAN_SEAT, cards)) {
      this.message = "这手牌不合法或压不过桌面";
      this.emit();
      return;
    }
    this.commitPlay(HUMAN_SEAT, cards);
    this.selected.clear();
    this.emit();
    this.scheduleAi();
  };

  pass = (): void => {
    if (!this.isHumanPlayTurn() || !canPass(this.state)) return;
    this.commitPass(HUMAN_SEAT);
    this.selected.clear();
    this.emit();
    this.scheduleAi();
  };

  hint = (): void => {
    if (!this.isHumanPlayTurn()) return;
    const plays = hintPlays(this.state, HUMAN_SEAT);
    if (plays.length === 0) {
      this.message = canPass(this.state) ? "没有能压的牌,可以选择不出" : "无牌可出";
      this.emit();
      return;
    }
    const play = plays[this.hintIndex % plays.length];
    this.hintIndex++;
    this.selected = new Set(play?.map((c) => c.id));
    this.emit();
  };

  dispose = (): void => {
    this.clearTimer();
    this.listeners.clear();
  };

  // —— 内部 ——

  private isHumanPlayTurn(): boolean {
    return this.started && this.state.phase === "playing" && this.state.current === HUMAN_SEAT;
  }

  private selectedCards(): Card[] {
    const hand = this.state.hands[HUMAN_SEAT] ?? [];
    return hand.filter((c) => this.selected.has(c.id));
  }

  private advanceBid(value: number): void {
    this.state = applyBid(this.state, value);
    if (this.state.needRedeal) {
      this.firstBidder = ((this.firstBidder + 1) % 3) as Seat;
      this.state = deal(this.firstBidder, this.state.scores);
      this.message = "三家都不叫,重新发牌";
      this.actions = [null, null, null];
    } else if (this.state.phase === "playing" && this.state.landlord !== null) {
      this.message = `${SEAT_NAME[this.state.landlord]}当地主(${this.state.multiplier}分)`;
      this.firstBidder = ((this.firstBidder + 1) % 3) as Seat;
    }
  }

  private commitPlay(seat: Seat, cards: readonly Card[]): void {
    const combo = validatePlay(this.state, seat, cards);
    if (!combo) return;
    this.state = applyPlay(this.state, cards);
    this.actions[seat] = { kind: "play", cards: cards.slice(), combo };
    this.hintIndex = 0;
    if (this.state.phase === "finished") {
      const won = this.state.winner === this.state.landlord;
      this.message = won ? "地主获胜！" : "农民获胜！";
    }
  }

  private commitPass(seat: Seat): void {
    const before = this.state.table;
    this.state = applyPass(this.state);
    // 若本次不出触发清桌(桌面变空),清掉全部出牌堆,由领出者重新领出。
    if (before && this.state.table === null) this.actions = [null, null, null];
    else this.actions[seat] = { kind: "pass" };
    this.hintIndex = 0;
  }

  private scheduleAi(): void {
    this.clearTimer();
    if (this.state.phase === "finished") return;
    if (this.state.current === HUMAN_SEAT) return;
    this.timer = setTimeout(() => this.aiStep(), AI_DELAY_MS);
  }

  private aiStep(): void {
    const seat = this.state.current;
    if (this.state.phase === "bidding") {
      const hand = this.state.hands[seat] ?? [];
      const value = chooseBid(hand, this.state.highestBid);
      this.message = value > 0 ? `${SEAT_NAME[seat]}叫${value}分` : `${SEAT_NAME[seat]}不叫`;
      this.advanceBid(value);
    } else if (this.state.phase === "playing") {
      const move = chooseMove(this.state, seat);
      if (move) {
        this.commitPlay(seat, move);
        const combo = this.actions[seat]?.combo;
        if (combo) this.message = `${SEAT_NAME[seat]}出${comboLabel(combo.type)} ${describe(move)}`;
      } else {
        this.commitPass(seat);
        this.message = `${SEAT_NAME[seat]}不出`;
      }
    }
    this.emit();
    this.scheduleAi();
  }

  private clearTimer(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private buildSnapshot(): Snapshot {
    return {
      started: this.started,
      state: this.state,
      selected: this.selected,
      thinking:
        this.started && this.state.current !== HUMAN_SEAT && this.state.phase !== "finished",
      actions: this.actions.slice(),
      message: this.message,
    };
  }

  private emit(): void {
    this.snap = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }
}

function describe(cards: readonly Card[]): string {
  return cards.map((c) => rankLabel(c.rank)).join(" ");
}
