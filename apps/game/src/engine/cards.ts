// 斗地主牌面模型。rank 用整数编码,直接反映斗地主大小顺序:
// 3<4<…<10<J<Q<K<A<2<小王<大王。花色只影响显示,不影响牌力。

export type Suit = "spades" | "hearts" | "clubs" | "diamonds" | "joker";

export interface Card {
  /** 一副牌内稳定唯一 id(0..53),用于选牌命中与去重。 */
  readonly id: number;
  /** 大小编码:3→3 … 10→10, J→11, Q→12, K→13, A→14, 2→15, 小王→16, 大王→17。 */
  readonly rank: number;
  readonly suit: Suit;
}

export const RANK_THREE = 3;
export const RANK_TWO = 15;
export const RANK_JOKER_SMALL = 16;
export const RANK_JOKER_BIG = 17;

/** 可组成顺子/连对/飞机的最高 rank(到 A 为止,2 与王不入连)。 */
export const MAX_CHAIN_RANK = 14;

const SUIT_SYMBOL: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  clubs: "♣",
  diamonds: "♦",
  joker: "",
};

const RANK_LABEL: Record<number, string> = {
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
  15: "2",
  16: "小王",
  17: "大王",
};

export function rankLabel(rank: number): string {
  return RANK_LABEL[rank] ?? String(rank);
}

export function suitSymbol(suit: Suit): string {
  return SUIT_SYMBOL[suit];
}

export function isJoker(card: Card): boolean {
  return card.suit === "joker";
}

export function isRed(card: Card): boolean {
  return card.suit === "hearts" || card.suit === "diamonds" || card.rank === RANK_JOKER_BIG;
}

/** 生成一副完整的 54 张牌,id 稳定为 0..53。 */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  const suits: Suit[] = ["spades", "hearts", "clubs", "diamonds"];
  let id = 0;
  for (let rank = RANK_THREE; rank <= RANK_TWO; rank++) {
    for (const suit of suits) {
      deck.push({ id: id++, rank, suit });
    }
  }
  deck.push({ id: id++, rank: RANK_JOKER_SMALL, suit: "joker" });
  deck.push({ id: id++, rank: RANK_JOKER_BIG, suit: "joker" });
  return deck;
}

/**
 * Fisher–Yates 洗牌。random 参数默认为 Math.random,但可注入确定性随机源,
 * 让引擎单测保持 hermetic(不依赖真实随机)。
 */
export function shuffle(deck: readonly Card[], random: () => number = Math.random): Card[] {
  const out = deck.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a && b) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

/** 按 rank 升序排列(相同 rank 再按 id 稳定),便于顺子从左到右阅读。 */
export function sortHand(cards: readonly Card[]): Card[] {
  return cards.slice().sort((a, b) => a.rank - b.rank || a.id - b.id);
}

/** 统计每个 rank 出现的张数。 */
export function countByRank(cards: readonly Card[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const card of cards) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }
  return counts;
}
