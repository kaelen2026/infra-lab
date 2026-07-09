import { describe, expect, it } from "vitest";
import { chooseBid, chooseMove } from "../src/engine/ai.js";
import { beats, identify } from "../src/engine/combos.js";
import { applyBid, deal, type GameState, validatePlay } from "../src/engine/game.js";
import { hand } from "./helpers.js";

const base = applyBid(
  deal(0, [0, 0, 0], () => 0.5),
  3,
);

describe("chooseMove", () => {
  it("领出时必出一手合法牌", () => {
    const s: GameState = {
      ...base,
      hands: [hand(3, 4, 5, 6, 7), hand(9), hand(10)],
      table: null,
      current: 0,
    };
    const move = chooseMove(s, 0);
    expect(move).not.toBeNull();
    expect(validatePlay(s, 0, move!)).not.toBeNull();
  });

  it("应牌时给出能压过桌面的一手", () => {
    const table = identify(hand(5))!;
    const s: GameState = {
      ...base,
      hands: [hand(3), hand(7, 8, 9), hand(10)],
      table: { seat: 0, combo: table },
      lastPlayer: 0,
      current: 1,
      landlord: 0, // 座位1是农民,座位0地主 → 会压
    };
    const move = chooseMove(s, 1);
    expect(move).not.toBeNull();
    const combo = identify(move!);
    expect(combo && beats(combo, table)).toBe(true);
  });

  it("不压同阵营队友", () => {
    const table = identify(hand(5))!;
    const s: GameState = {
      ...base,
      hands: [hand(9, 10, 11), hand(6), hand(7)],
      table: { seat: 2, combo: table },
      lastPlayer: 2,
      current: 1,
      landlord: 0, // 座位1、2 都是农民 → 队友,不压
    };
    expect(chooseMove(s, 1)).toBeNull();
  });
});

describe("chooseBid", () => {
  it("强手叫分,弱手不叫", () => {
    expect(chooseBid(hand(16, 17, 15, 15), 0)).toBeGreaterThan(0);
    expect(chooseBid(hand(3, 4, 5, 6, 7), 0)).toBe(0);
    // 不超过已有最高分则放弃
    expect(chooseBid(hand(15, 15), 2)).toBe(0);
  });
});
