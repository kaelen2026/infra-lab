// 斗地主牌型识别与比较。identify() 接收"玩家打算出的这一手确切牌集",
// 返回唯一的合法牌型或 null;beats() 判断候选牌型能否压过桌面牌型。
//
// rank 语义(用于同型比较):
//  - 单/对/三/三带:主牌(那张单/对/三)的 rank;
//  - 顺子/连对/飞机:牌链最高一节的 rank;
//  - 炸弹:四张的 rank;火箭:固定最大。

import { type Card, countByRank, MAX_CHAIN_RANK } from "./cards.js";

export const COMBO = {
  SINGLE: "single",
  PAIR: "pair",
  TRIPLE: "triple",
  TRIPLE_SINGLE: "triple-single",
  TRIPLE_PAIR: "triple-pair",
  STRAIGHT: "straight",
  STRAIGHT_PAIR: "straight-pair",
  AIRPLANE: "airplane",
  AIRPLANE_SINGLE: "airplane-single",
  AIRPLANE_PAIR: "airplane-pair",
  BOMB: "bomb",
  ROCKET: "rocket",
} as const;

export type ComboType = (typeof COMBO)[keyof typeof COMBO];

export interface Combo {
  readonly type: ComboType;
  /** 同型比较用的主 rank(见文件头说明)。 */
  readonly rank: number;
  /** 牌数;同型比较要求长度一致(顺子/连对/飞机各自长度不同不可比)。 */
  readonly length: number;
  readonly cards: readonly Card[];
}

const CHAIN_TYPES = new Set<ComboType>([
  COMBO.STRAIGHT,
  COMBO.STRAIGHT_PAIR,
  COMBO.AIRPLANE,
  COMBO.AIRPLANE_SINGLE,
  COMBO.AIRPLANE_PAIR,
]);

function isConsecutive(ranks: number[]): boolean {
  for (let i = 1; i < ranks.length; i++) {
    if ((ranks[i] ?? 0) !== (ranks[i - 1] ?? 0) + 1) return false;
  }
  return true;
}

/** 分组:按出现张数把 rank 收集到 singles/pairs/triples/quads。 */
function groupByCount(counts: Map<number, number>) {
  const singles: number[] = [];
  const pairs: number[] = [];
  const triples: number[] = [];
  const quads: number[] = [];
  for (const [rank, n] of counts) {
    if (n === 1) singles.push(rank);
    else if (n === 2) pairs.push(rank);
    else if (n === 3) triples.push(rank);
    else if (n === 4) quads.push(rank);
  }
  return { singles, pairs, triples, quads };
}

function combo(type: ComboType, rank: number, cards: readonly Card[]): Combo {
  return { type, rank, length: cards.length, cards };
}

/**
 * 识别一手牌的牌型。返回 null 表示这些牌不构成任何合法牌型(非法出牌)。
 */
export function identify(cards: readonly Card[]): Combo | null {
  const n = cards.length;
  if (n === 0) return null;

  const counts = countByRank(cards);

  // 火箭:恰好双王。
  if (n === 2 && counts.get(16) === 1 && counts.get(17) === 1) {
    return combo(COMBO.ROCKET, 17, cards);
  }

  const { singles, pairs, triples, quads } = groupByCount(counts);
  const distinct = counts.size;

  // 炸弹:四张同点。
  if (n === 4 && quads.length === 1) {
    return combo(COMBO.BOMB, quads[0] ?? 0, cards);
  }

  // 定长小牌型。
  if (n === 1) return combo(COMBO.SINGLE, cards[0]?.rank ?? 0, cards);
  if (n === 2 && distinct === 1) return combo(COMBO.PAIR, cards[0]?.rank ?? 0, cards);
  if (n === 3 && distinct === 1) return combo(COMBO.TRIPLE, triples[0] ?? 0, cards);
  if (n === 4 && triples.length === 1 && singles.length === 1) {
    return combo(COMBO.TRIPLE_SINGLE, triples[0] ?? 0, cards);
  }
  if (n === 5 && triples.length === 1 && pairs.length === 1) {
    return combo(COMBO.TRIPLE_PAIR, triples[0] ?? 0, cards);
  }

  // 顺子:>=5 张全单,点数连续且 <=A。
  if (n >= 5 && singles.length === n) {
    const sorted = singles.slice().sort((a, b) => a - b);
    if ((sorted.at(-1) ?? 99) <= MAX_CHAIN_RANK && isConsecutive(sorted)) {
      return combo(COMBO.STRAIGHT, sorted.at(-1) ?? 0, cards);
    }
    return null;
  }

  // 连对:>=3 对,点数连续且 <=A。
  if (n >= 6 && pairs.length === n / 2 && pairs.length === distinct) {
    const sorted = pairs.slice().sort((a, b) => a - b);
    if (pairs.length >= 3 && (sorted.at(-1) ?? 99) <= MAX_CHAIN_RANK && isConsecutive(sorted)) {
      return combo(COMBO.STRAIGHT_PAIR, sorted.at(-1) ?? 0, cards);
    }
    return null;
  }

  // 飞机家族:>=2 个连续三张,三张点数 <=A。
  if (triples.length >= 2) {
    const chain = triples.slice().sort((a, b) => a - b);
    if ((chain.at(-1) ?? 99) > MAX_CHAIN_RANK || !isConsecutive(chain)) return null;
    const t = chain.length;
    const top = chain.at(-1) ?? 0;
    const wingCount = n - 3 * t;
    // 纯飞机:无翼。
    if (wingCount === 0) return combo(COMBO.AIRPLANE, top, cards);
    // 带单翼:每节配一张单牌(翼可任意点数,允许恰好成对)。
    if (wingCount === t && quads.length === 0) {
      return combo(COMBO.AIRPLANE_SINGLE, top, cards);
    }
    // 带双翼:每节配一对。
    if (wingCount === 2 * t && pairs.length === t) {
      return combo(COMBO.AIRPLANE_PAIR, top, cards);
    }
    return null;
  }

  return null;
}

/**
 * 候选牌型 candidate 能否压过桌面牌型 current。
 * current 为 null 表示自由出牌(新一轮),任何合法牌型都可以打。
 */
export function beats(candidate: Combo, current: Combo | null): boolean {
  if (!current) return true;
  if (candidate.type === COMBO.ROCKET) return true;
  if (current.type === COMBO.ROCKET) return false;

  if (candidate.type === COMBO.BOMB) {
    if (current.type === COMBO.BOMB) return candidate.rank > current.rank;
    return true; // 炸弹压非炸弹
  }
  if (current.type === COMBO.BOMB) return false;

  // 普通牌型:必须同型、同长度、主 rank 更大。
  if (candidate.type !== current.type) return false;
  if (CHAIN_TYPES.has(candidate.type) && candidate.length !== current.length) return false;
  return candidate.rank > current.rank;
}

const COMBO_LABEL: Record<ComboType, string> = {
  single: "单张",
  pair: "对子",
  triple: "三张",
  "triple-single": "三带一",
  "triple-pair": "三带二",
  straight: "顺子",
  "straight-pair": "连对",
  airplane: "飞机",
  "airplane-single": "飞机带单",
  "airplane-pair": "飞机带对",
  bomb: "炸弹",
  rocket: "王炸",
};

export function comboLabel(type: ComboType): string {
  return COMBO_LABEL[type];
}
