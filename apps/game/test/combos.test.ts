import { describe, expect, it } from "vitest";
import { beats, COMBO, identify } from "../src/engine/combos.js";
import { hand } from "./helpers.js";

describe("identify", () => {
  it("识别定长小牌型", () => {
    expect(identify(hand(5))?.type).toBe(COMBO.SINGLE);
    expect(identify(hand(7, 7))?.type).toBe(COMBO.PAIR);
    expect(identify(hand(9, 9, 9))?.type).toBe(COMBO.TRIPLE);
    expect(identify(hand(9, 9, 9, 4))?.type).toBe(COMBO.TRIPLE_SINGLE);
    expect(identify(hand(9, 9, 9, 4, 4))?.type).toBe(COMBO.TRIPLE_PAIR);
  });

  it("炸弹与火箭", () => {
    expect(identify(hand(6, 6, 6, 6))?.type).toBe(COMBO.BOMB);
    expect(identify(hand(16, 17))?.type).toBe(COMBO.ROCKET);
    // 单王不是火箭
    expect(identify(hand(16, 5))).toBeNull();
  });

  it("顺子:>=5 连续,含 2 或长度不足则非法", () => {
    expect(identify(hand(3, 4, 5, 6, 7))?.type).toBe(COMBO.STRAIGHT);
    expect(identify(hand(10, 11, 12, 13, 14))?.rank).toBe(14);
    expect(identify(hand(3, 4, 5, 6))).toBeNull(); // 只有 4 张
    expect(identify(hand(11, 12, 13, 14, 15))).toBeNull(); // 含 2
    expect(identify(hand(3, 4, 5, 6, 8))).toBeNull(); // 不连续
  });

  it("连对与飞机", () => {
    expect(identify(hand(3, 3, 4, 4, 5, 5))?.type).toBe(COMBO.STRAIGHT_PAIR);
    expect(identify(hand(3, 3, 4, 4))).toBeNull(); // 连对至少 3 对
    expect(identify(hand(5, 5, 5, 6, 6, 6))?.type).toBe(COMBO.AIRPLANE);
    expect(identify(hand(5, 5, 5, 6, 6, 6, 3, 4))?.type).toBe(COMBO.AIRPLANE_SINGLE);
    expect(identify(hand(5, 5, 5, 6, 6, 6, 3, 3, 4, 4))?.type).toBe(COMBO.AIRPLANE_PAIR);
    // 三张不连续不是飞机
    expect(identify(hand(5, 5, 5, 7, 7, 7))).toBeNull();
  });
});

describe("beats", () => {
  const single9 = identify(hand(9))!;
  const singleK = identify(hand(13))!;
  const pair9 = identify(hand(9, 9))!;
  const bomb6 = identify(hand(6, 6, 6, 6))!;
  const bomb8 = identify(hand(8, 8, 8, 8))!;
  const rocket = identify(hand(16, 17))!;

  it("自由出牌任何牌型都能出", () => {
    expect(beats(single9, null)).toBe(true);
  });

  it("同型比大小,异型不可压", () => {
    expect(beats(singleK, single9)).toBe(true);
    expect(beats(single9, singleK)).toBe(false);
    expect(beats(pair9, single9)).toBe(false); // 对子压不了单张
  });

  it("炸弹压普通牌,大炸压小炸,火箭最大", () => {
    expect(beats(bomb6, single9)).toBe(true);
    expect(beats(bomb8, bomb6)).toBe(true);
    expect(beats(bomb6, bomb8)).toBe(false);
    expect(beats(rocket, bomb8)).toBe(true);
    expect(beats(bomb8, rocket)).toBe(false);
  });

  it("顺子长度不同不可比", () => {
    const s1 = identify(hand(3, 4, 5, 6, 7))!;
    const s2 = identify(hand(4, 5, 6, 7, 8, 9))!;
    expect(beats(s2, s1)).toBe(false);
  });
});
