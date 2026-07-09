import { describe, expect, it } from "vitest";
import {
  applyBid,
  applyPass,
  applyPlay,
  canPass,
  deal,
  type GameState,
  validatePlay,
} from "../src/engine/game.js";
import { hand } from "./helpers.js";

// 确定性 PRNG,保证发牌可复现。
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("deal", () => {
  it("每家 17 张、底牌 3 张、共 54 张不重复", () => {
    const s = deal(0, [0, 0, 0], seeded(42));
    expect(s.hands.map((h) => h.length)).toEqual([17, 17, 17]);
    expect(s.bottom.length).toBe(3);
    const ids = new Set([...s.hands.flat(), ...s.bottom].map((c) => c.id));
    expect(ids.size).toBe(54);
  });
});

describe("bidding", () => {
  it("叫到 3 分立即定地主,地主收底牌变 20 张", () => {
    const s = applyBid(deal(0, [0, 0, 0], seeded(1)), 3);
    expect(s.phase).toBe("playing");
    expect(s.landlord).toBe(0);
    expect(s.hands[0]?.length).toBe(20);
    expect(s.current).toBe(0);
    expect(s.multiplier).toBe(3);
  });

  it("三家都不叫则要求重新发牌", () => {
    let s = deal(0, [0, 0, 0], seeded(2));
    s = applyBid(s, 0);
    s = applyBid(s, 0);
    s = applyBid(s, 0);
    expect(s.needRedeal).toBe(true);
    expect(s.phase).toBe("bidding");
  });
});

describe("play / pass", () => {
  const base = applyBid(deal(0, [0, 0, 0], seeded(7)), 3);

  it("自由领出时不能不出", () => {
    const s: GameState = { ...base, hands: [hand(3), hand(4), hand(5)], table: null, current: 0 };
    expect(canPass(s)).toBe(false);
  });

  it("出完最后一张即获胜,比分零和结算", () => {
    const s: GameState = {
      ...base,
      hands: [hand(3), hand(4), hand(5)],
      table: null,
      lastPlayer: null,
      current: 0,
      landlord: 0,
      multiplier: 3,
      scores: [0, 0, 0],
    };
    const three = s.hands[0]?.[0];
    expect(three).toBeTruthy();
    const next = applyPlay(s, [three!]);
    expect(next.phase).toBe("finished");
    expect(next.winner).toBe(0);
    expect(next.scores[0] + next.scores[1] + next.scores[2]).toBe(0);
    expect(next.scores[0]).toBeGreaterThan(0); // 地主赢
  });

  it("两家连续不出则清桌,由领出者重新领出", () => {
    let s: GameState = {
      ...base,
      hands: [hand(3, 4), hand(5, 6), hand(7, 8)],
      table: null,
      lastPlayer: null,
      current: 0,
    };
    const lead = s.hands[0]?.[0];
    s = applyPlay(s, [lead!]);
    expect(s.current).toBe(1);
    expect(s.table).not.toBeNull();
    s = applyPass(s);
    expect(s.current).toBe(2);
    s = applyPass(s);
    expect(s.table).toBeNull();
    expect(s.current).toBe(0);
  });

  it("validatePlay 拒绝非法出牌", () => {
    const s: GameState = { ...base, hands: [hand(3), hand(4), hand(5)], table: null, current: 0 };
    // 不是当前玩家
    expect(validatePlay(s, 1, s.hands[1]!)).toBeNull();
    // 手里没有的牌
    expect(validatePlay(s, 0, hand(9))).toBeNull();
  });
});
