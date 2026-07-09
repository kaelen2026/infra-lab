import type { Card, Suit } from "../src/engine/cards.js";

let nextId = 0;

/** 造一张牌;joker 点位自动用 joker 花色。 */
export function card(rank: number, suit: Suit = "spades"): Card {
  const s: Suit = rank >= 16 ? "joker" : suit;
  return { id: nextId++, rank, suit: s };
}

/** 由一串点位造一手牌(花色不影响牌型判定)。 */
export function hand(...ranks: number[]): Card[] {
  return ranks.map((r) => card(r));
}
