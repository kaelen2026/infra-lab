// 斗地主状态机(纯函数):所有转移都返回新的 GameState,便于 React 以快照订阅。
// 座位 0=你(下)、1=右家、2=左家,出牌顺序 0→1→2→0。

import { type Card, createDeck, shuffle, sortHand } from "./cards.js";
import { beats, COMBO, type Combo, identify } from "./combos.js";

export type Seat = 0 | 1 | 2;
export type Phase = "bidding" | "playing" | "finished";

export interface TablePlay {
  readonly seat: Seat;
  readonly combo: Combo;
}

export interface GameState {
  readonly phase: Phase;
  /** 每个座位的手牌(rank 升序)。 */
  readonly hands: readonly (readonly Card[])[];
  /** 地主底牌 3 张(叫牌阶段亮出后归地主)。 */
  readonly bottom: readonly Card[];
  readonly landlord: Seat | null;
  readonly current: Seat;

  // —— 叫地主阶段 ——
  readonly firstBidder: Seat;
  /** 已进行的叫牌轮数(0..3),seat = (firstBidder + bidTurn) % 3。 */
  readonly bidTurn: number;
  readonly highestBid: number;
  readonly highestBidder: Seat | null;
  /** 三家都不叫,需要重新发牌。 */
  readonly needRedeal: boolean;

  // —— 出牌阶段 ——
  /** 桌面待压的牌型;null = 自由出牌(新一轮由 current 领出)。 */
  readonly table: TablePlay | null;
  readonly lastPlayer: Seat | null;
  /** 自上次出牌以来连续 pass 数;达到 2 则本轮清桌。 */
  readonly passStreak: number;
  readonly multiplier: number;
  readonly bombs: number;

  // —— 结算 ——
  readonly winner: Seat | null;
  /** 累计比分(跨局保留),index 对应座位。 */
  readonly scores: readonly [number, number, number];
}

const HAND_SIZE = 17;

export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 3) as Seat;
}

export function isLandlord(state: GameState, seat: Seat): boolean {
  return state.landlord === seat;
}

/** seat 是否与 other 同一阵营(都地主或都农民)。 */
export function sameSide(state: GameState, a: Seat, b: Seat): boolean {
  if (state.landlord === null) return false;
  return (a === state.landlord) === (b === state.landlord);
}

/**
 * 发一局牌:每家 17 张,留 3 张底牌。firstBidder 为首个叫牌者。
 * scores 从上一局继承(默认 0),random 可注入以保证单测确定性。
 */
export function deal(
  firstBidder: Seat = 0,
  scores: readonly [number, number, number] = [0, 0, 0],
  random: () => number = Math.random,
): GameState {
  const shuffled = shuffle(createDeck(), random);
  const hands: Card[][] = [[], [], []];
  for (let i = 0; i < HAND_SIZE * 3; i++) {
    const card = shuffled[i];
    if (card) hands[i % 3]?.push(card);
  }
  const bottom = shuffled.slice(HAND_SIZE * 3);
  return {
    phase: "bidding",
    hands: hands.map(sortHand),
    bottom,
    landlord: null,
    current: firstBidder,
    firstBidder,
    bidTurn: 0,
    highestBid: 0,
    highestBidder: null,
    needRedeal: false,
    table: null,
    lastPlayer: null,
    passStreak: 0,
    multiplier: 1,
    bombs: 0,
    winner: null,
    scores: [scores[0], scores[1], scores[2]],
  };
}

/** current 座位当前可叫的分值(严格大于 highestBid,上限 3)。 */
export function legalBids(state: GameState): number[] {
  const out: number[] = [];
  for (let v = state.highestBid + 1; v <= 3; v++) out.push(v);
  return out;
}

/**
 * 叫牌:value 为 0 表示不叫,1..3 表示叫分(须 > highestBid)。
 * 三家各叫一次后(或有人叫到 3)结算:最高者当地主并收底牌。
 */
export function applyBid(state: GameState, value: number): GameState {
  if (state.phase !== "bidding") return state;
  const seat = state.current;
  let { highestBid, highestBidder } = state;
  if (value > highestBid) {
    highestBid = value;
    highestBidder = seat;
  }
  const bidTurn = state.bidTurn + 1;
  const resolved = highestBid === 3 || bidTurn >= 3;

  if (!resolved) {
    return {
      ...state,
      highestBid,
      highestBidder,
      bidTurn,
      current: ((state.firstBidder + bidTurn) % 3) as Seat,
    };
  }

  if (highestBidder === null) {
    // 三家都不叫,交由控制器重新发牌。
    return { ...state, highestBid, highestBidder, bidTurn, needRedeal: true };
  }

  const landlord = highestBidder;
  const hands = state.hands.map((hand, seatIdx) =>
    seatIdx === landlord ? sortHand([...hand, ...state.bottom]) : hand,
  );
  return {
    ...state,
    phase: "playing",
    hands,
    landlord,
    current: landlord,
    highestBid,
    highestBidder,
    bidTurn,
    multiplier: highestBid,
    table: null,
    lastPlayer: null,
    passStreak: 0,
  };
}

/** 判断 cards 是否为 seat 手中一手合法且能压桌面的出牌。返回识别出的牌型或 null。 */
export function validatePlay(state: GameState, seat: Seat, cards: readonly Card[]): Combo | null {
  if (state.phase !== "playing" || state.current !== seat || cards.length === 0) return null;
  const hand = state.hands[seat];
  if (!hand) return null;
  const handIds = new Set(hand.map((c) => c.id));
  if (!cards.every((c) => handIds.has(c.id))) return null;
  const combo = identify(cards);
  if (!combo) return null;
  const table = state.current === state.lastPlayer ? null : state.table;
  if (!beats(combo, table?.combo ?? null)) return null;
  return combo;
}

/** 出牌。调用方须先用 validatePlay 确认合法(AI 与 UI 都会)。 */
export function applyPlay(state: GameState, cards: readonly Card[]): GameState {
  const seat = state.current;
  const combo = validatePlay(state, seat, cards);
  if (!combo) return state;

  const playedIds = new Set(cards.map((c) => c.id));
  const hands = state.hands.map((hand, seatIdx) =>
    seatIdx === seat ? hand.filter((c) => !playedIds.has(c.id)) : hand,
  );
  const doubled = combo.type === COMBO.BOMB || combo.type === COMBO.ROCKET;
  const multiplier = doubled ? state.multiplier * 2 : state.multiplier;
  const bombs = doubled ? state.bombs + 1 : state.bombs;
  const remaining = hands[seat]?.length ?? 0;

  if (remaining === 0) {
    return {
      ...state,
      hands,
      multiplier,
      bombs,
      table: { seat, combo },
      lastPlayer: seat,
      passStreak: 0,
      phase: "finished",
      winner: seat,
      scores: settle(state, seat, multiplier),
    };
  }

  return {
    ...state,
    hands,
    multiplier,
    bombs,
    table: { seat, combo },
    lastPlayer: seat,
    passStreak: 0,
    current: nextSeat(seat),
  };
}

/** current 座位是否可以不出(自由领出时不允许 pass)。 */
export function canPass(state: GameState): boolean {
  if (state.phase !== "playing") return false;
  return state.table !== null && state.current !== state.lastPlayer;
}

/** 不出。连续两家不出则清桌,由最后出牌者重新领出。 */
export function applyPass(state: GameState): GameState {
  if (!canPass(state)) return state;
  const passStreak = state.passStreak + 1;
  if (passStreak >= 2 && state.lastPlayer !== null) {
    return { ...state, table: null, passStreak: 0, current: state.lastPlayer };
  }
  return { ...state, passStreak, current: nextSeat(state.current) };
}

/** 结算比分:地主赢则 +2×倍数、两农民各 -倍数;地主输反之。零和。 */
function settle(state: GameState, winner: Seat, multiplier: number): [number, number, number] {
  const landlord = state.landlord;
  const scores: [number, number, number] = [state.scores[0], state.scores[1], state.scores[2]];
  if (landlord === null) return scores;
  const landlordWon = winner === landlord;
  const delta = landlordWon ? 2 * multiplier : -2 * multiplier;
  for (let s = 0 as Seat; s < 3; s = (s + 1) as Seat) {
    if (s === landlord) scores[s] += delta;
    else scores[s] -= delta / 2;
  }
  return scores;
}
