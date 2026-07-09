// 单机对手 AI:枚举合法出牌 + 一套朴素但像样的策略。
// 目标不是最优解,而是"能连招、留炸弹、队友不互压、残局补刀"的可玩对手。

import {
  type Card,
  countByRank,
  MAX_CHAIN_RANK,
  RANK_JOKER_BIG,
  RANK_JOKER_SMALL,
} from "./cards.js";
import { beats, COMBO, type Combo } from "./combos.js";
import { type GameState, type Seat, sameSide } from "./game.js";

type Play = Card[];

function groupsByRank(hand: readonly Card[]): Map<number, Card[]> {
  const byRank = new Map<number, Card[]>();
  for (const card of hand) {
    const bucket = byRank.get(card.rank);
    if (bucket) bucket.push(card);
    else byRank.set(card.rank, [card]);
  }
  return byRank;
}

/** 升序取 <=A 且满足最少张数的 rank(顺子/连对/飞机的候选点位)。 */
function chainRanks(byRank: Map<number, Card[]>, minCount: number): number[] {
  const out: number[] = [];
  for (let r = 3; r <= MAX_CHAIN_RANK; r++) {
    if ((byRank.get(r)?.length ?? 0) >= minCount) out.push(r);
  }
  return out;
}

/** 在升序 rank 列表里找出所有长度为 len 的连续窗口。 */
function runs(ranks: number[], len: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i + len <= ranks.length; i++) {
    let ok = true;
    for (let k = 1; k < len; k++) {
      if ((ranks[i + k] ?? 0) !== (ranks[i + k - 1] ?? 0) + 1) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(ranks.slice(i, i + len));
  }
  return out;
}

function take(byRank: Map<number, Card[]>, rank: number, n: number): Card[] {
  return (byRank.get(rank) ?? []).slice(0, n);
}

/** 挑 count 张单牌当配脚,尽量不拆对子/炸弹:优先张数少的点位,排除指定点位。 */
function pickSingles(
  byRank: Map<number, Card[]>,
  count: number,
  exclude: Set<number>,
): Card[] | null {
  const ranks = [...byRank.keys()]
    .filter((r) => !exclude.has(r))
    .sort((a, b) => (byRank.get(a)?.length ?? 0) - (byRank.get(b)?.length ?? 0) || a - b);
  const out: Card[] = [];
  for (const r of ranks) {
    const card = byRank.get(r)?.[0];
    if (card) out.push(card);
    if (out.length === count) return out;
  }
  return null;
}

/** 挑 count 对当配脚,升序,排除指定点位。 */
function pickPairs(
  byRank: Map<number, Card[]>,
  count: number,
  exclude: Set<number>,
): Card[] | null {
  const ranks = [...byRank.keys()]
    .filter((r) => !exclude.has(r) && (byRank.get(r)?.length ?? 0) >= 2)
    .sort((a, b) => a - b);
  const out: Card[] = [];
  for (const r of ranks) {
    out.push(...take(byRank, r, 2));
    if (out.length === count * 2) return out;
  }
  return null;
}

function bombs(byRank: Map<number, Card[]>): Play[] {
  const out: Play[] = [];
  for (const [rank, cards] of byRank) {
    if (cards.length === 4 && rank <= MAX_CHAIN_RANK + 1) out.push(cards.slice());
  }
  // 2 也可以是炸弹(四个 2)
  for (const [rank, cards] of byRank) {
    if (cards.length === 4 && rank > MAX_CHAIN_RANK + 1) out.push(cards.slice());
  }
  return out.sort((a, b) => (a[0]?.rank ?? 0) - (b[0]?.rank ?? 0));
}

function rocket(byRank: Map<number, Card[]>): Play | null {
  const small = byRank.get(RANK_JOKER_SMALL)?.[0];
  const big = byRank.get(RANK_JOKER_BIG)?.[0];
  return small && big ? [small, big] : null;
}

/** 枚举所有能压过 current 的普通出牌(不含炸弹/火箭,单独处理)。 */
function normalResponses(hand: readonly Card[], current: Combo): Play[] {
  const byRank = groupsByRank(hand);
  const out: Play[] = [];
  const min = current.rank;
  const nonBombRank = (r: number) => (byRank.get(r)?.length ?? 0) !== 4; // 不拆炸弹

  switch (current.type) {
    case COMBO.SINGLE:
      for (const [r, cs] of byRank) if (r > min && cs[0]) out.push([cs[0]]);
      break;
    case COMBO.PAIR:
      for (const [r, cs] of byRank)
        if (r > min && cs.length >= 2 && nonBombRank(r)) out.push(take(byRank, r, 2));
      break;
    case COMBO.TRIPLE:
      for (const [r, cs] of byRank)
        if (r > min && cs.length >= 3 && nonBombRank(r)) out.push(take(byRank, r, 3));
      break;
    case COMBO.TRIPLE_SINGLE:
    case COMBO.TRIPLE_PAIR: {
      const wantPair = current.type === COMBO.TRIPLE_PAIR;
      for (const [r, cs] of byRank) {
        if (r <= min || cs.length < 3 || !nonBombRank(r)) continue;
        const wings = wantPair
          ? pickPairs(byRank, 1, new Set([r]))
          : pickSingles(byRank, 1, new Set([r]));
        if (wings) out.push([...take(byRank, r, 3), ...wings]);
      }
      break;
    }
    case COMBO.STRAIGHT:
      for (const win of runs(chainRanks(byRank, 1), current.length)) {
        if ((win.at(-1) ?? 0) > min)
          out.push(win.map((r) => take(byRank, r, 1)[0]).filter(Boolean) as Card[]);
      }
      break;
    case COMBO.STRAIGHT_PAIR:
      for (const win of runs(chainRanks(byRank, 2), current.length / 2)) {
        if ((win.at(-1) ?? 0) > min) out.push(win.flatMap((r) => take(byRank, r, 2)));
      }
      break;
    case COMBO.AIRPLANE:
    case COMBO.AIRPLANE_SINGLE:
    case COMBO.AIRPLANE_PAIR: {
      const per =
        current.type === COMBO.AIRPLANE ? 3 : current.type === COMBO.AIRPLANE_SINGLE ? 4 : 5;
      const t = current.length / per;
      for (const win of runs(chainRanks(byRank, 3), t)) {
        if ((win.at(-1) ?? 0) <= min) continue;
        const core = win.flatMap((r) => take(byRank, r, 3));
        const exclude = new Set(win);
        if (current.type === COMBO.AIRPLANE) {
          out.push(core);
        } else if (current.type === COMBO.AIRPLANE_SINGLE) {
          const w = pickSingles(byRank, t, exclude);
          if (w) out.push([...core, ...w]);
        } else {
          const w = pickPairs(byRank, t, exclude);
          if (w) out.push([...core, ...w]);
        }
      }
      break;
    }
    default:
      break;
  }
  return out.sort((a, b) => (comboRank(a) ?? 0) - (comboRank(b) ?? 0) || a.length - b.length);
}

function comboRank(play: Play): number {
  // 主 rank 近似:取出现次数最多的点位(用于给候选排序,越小越省)。
  const counts = countByRank(play);
  let best = 0;
  let bestCount = 0;
  for (const [rank, n] of counts) {
    if (n > bestCount || (n === bestCount && rank < best)) {
      best = rank;
      bestCount = n;
    }
  }
  return best;
}

/** 领出时的候选:优先甩长牌链,保留炸弹/火箭。 */
function leadCandidates(hand: readonly Card[]): Play[] {
  const byRank = groupsByRank(hand);
  // 1) 最长顺子
  for (let len = Math.min(12, hand.length); len >= 5; len--) {
    const win = runs(chainRanks(byRank, 1), len)[0];
    if (win) return [win.map((r) => take(byRank, r, 1)[0]).filter(Boolean) as Card[]];
  }
  // 2) 连对
  for (let pairs = 5; pairs >= 3; pairs--) {
    const win = runs(chainRanks(byRank, 2), pairs)[0];
    if (win) return [win.flatMap((r) => take(byRank, r, 2))];
  }
  // 3) 三带一(甩四张)
  for (const [r, cs] of [...byRank].sort((a, b) => a[0] - b[0])) {
    if (cs.length >= 3 && r <= MAX_CHAIN_RANK) {
      const wings = pickSingles(byRank, 1, new Set([r]));
      return [wings ? [...take(byRank, r, 3), ...wings] : take(byRank, r, 3)];
    }
  }
  // 4) 最低的对子
  for (const [r, cs] of [...byRank].sort((a, b) => a[0] - b[0])) {
    if (cs.length >= 2 && cs.length !== 4) return [take(byRank, r, 2)];
  }
  // 5) 最低单张
  const lowest = [...byRank.keys()].sort((a, b) => a - b)[0];
  if (lowest !== undefined) return [take(byRank, lowest, 1)];
  return [];
}

/**
 * 为 current 座位挑一手牌;返回 null 表示不出(pass)。
 * 调用方保证 state.current === seat 且处于出牌阶段。
 */
export function chooseMove(state: GameState, seat: Seat): Play | null {
  const hand = state.hands[seat];
  if (!hand) return null;
  const byRank = groupsByRank(hand);
  const table = state.table;

  // 领出:自由出牌。
  if (table === null) {
    return leadCandidates(hand)[0] ?? null;
  }

  // 不压队友(农民之间)。
  if (sameSide(state, seat, table.seat)) return null;

  const opponentCards = state.hands[table.seat]?.length ?? 99;

  // 先找普通压制,取最省的一手。
  const normals = normalResponses(hand, table.combo);
  if (normals[0]) return normals[0];

  // 无普通牌可压:残局或对手将赢时才动炸弹/火箭。
  const canDoubleThreat = opponentCards <= 2;
  if (canDoubleThreat) {
    const bomb = bombs(byRank).find((b) =>
      beats({ type: COMBO.BOMB, rank: b[0]?.rank ?? 0, length: 4, cards: b }, table.combo),
    );
    if (bomb) return bomb;
    const rk = rocket(byRank);
    if (rk) return rk;
  }
  return null;
}

/**
 * 为 UI 的"提示"枚举当前座位可出的候选手(用于循环高亮)。
 * 领出时给出一组由省到费的选择;应牌时给出所有能压过桌面的牌(含炸弹/火箭)。
 */
export function hintPlays(state: GameState, seat: Seat): Play[] {
  const hand = state.hands[seat];
  if (!hand) return [];
  const byRank = groupsByRank(hand);

  const out: Play[] = [];
  if (state.table === null) {
    const lead = leadCandidates(hand)[0];
    if (lead) out.push(lead);
    const ascRanks = [...byRank.keys()].sort((a, b) => a - b);
    for (const r of ascRanks) {
      const c = byRank.get(r)?.[0];
      if (c) out.push([c]);
    }
    for (const r of ascRanks) {
      if ((byRank.get(r)?.length ?? 0) >= 2) out.push(take(byRank, r, 2));
    }
  } else {
    out.push(...normalResponses(hand, state.table.combo));
    for (const b of bombs(byRank)) {
      const combo = { type: COMBO.BOMB, rank: b[0]?.rank ?? 0, length: 4, cards: b } as const;
      if (beats(combo, state.table.combo)) out.push(b);
    }
    const rk = rocket(byRank);
    if (rk) out.push(rk);
  }

  // 去重(同一组牌的 id 集合只留一份)。
  const seen = new Set<string>();
  const unique: Play[] = [];
  for (const play of out) {
    const key = play
      .map((c) => c.id)
      .sort((a, b) => a - b)
      .join(",");
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(play);
    }
  }
  return unique;
}

/** 叫地主决策:按大牌/炸弹粗评手牌,返回叫的分值(0=不叫)。 */
export function chooseBid(hand: readonly Card[], highestBid: number): number {
  const byRank = groupsByRank(hand);
  let strength = 0;
  if (byRank.has(RANK_JOKER_BIG)) strength += 2;
  if (byRank.has(RANK_JOKER_SMALL)) strength += 1;
  strength += byRank.get(15)?.length ?? 0; // 2 的张数
  for (const cs of byRank.values()) if (cs.length === 4) strength += 2; // 炸弹
  const desired = strength >= 6 ? 3 : strength >= 4 ? 2 : strength >= 2 ? 1 : 0;
  return desired > highestBid ? Math.min(desired, 3) : 0;
}
