import { describe, expect, it } from "vitest";

import {
  clampIndex,
  DEFAULT_SWIPE_THRESHOLDS,
  resolveSwipe,
  stepIndex,
} from "../features/timeline/image-gallery-nav";

describe("clampIndex", () => {
  it("keeps an in-range index unchanged", () => {
    expect(clampIndex(2, 5)).toBe(2);
  });

  it("clamps below zero and past the end", () => {
    expect(clampIndex(-3, 5)).toBe(0);
    expect(clampIndex(9, 5)).toBe(4);
  });

  it("returns 0 for an empty gallery", () => {
    expect(clampIndex(0, 0)).toBe(0);
  });
});

describe("stepIndex", () => {
  it("moves one step in each direction", () => {
    expect(stepIndex(1, 5, 1)).toBe(2);
    expect(stepIndex(1, 5, -1)).toBe(0);
  });

  it("does not wrap past the ends", () => {
    expect(stepIndex(0, 5, -1)).toBe(0);
    expect(stepIndex(4, 5, 1)).toBe(4);
  });
});

describe("resolveSwipe", () => {
  const { horizontal, down } = DEFAULT_SWIPE_THRESHOLDS;

  it("swipe left goes to the next image", () => {
    expect(resolveSwipe({ dx: -(horizontal + 1), dy: 0 })).toBe("next");
  });

  it("swipe right goes to the previous image", () => {
    expect(resolveSwipe({ dx: horizontal + 1, dy: 0 })).toBe("prev");
  });

  it("a downward drag past the threshold closes", () => {
    expect(resolveSwipe({ dx: 0, dy: down + 1 })).toBe("close");
  });

  it("an upward drag does nothing", () => {
    expect(resolveSwipe({ dx: 0, dy: -(down + 1) })).toBe("none");
  });

  it("a short jitter does nothing", () => {
    expect(resolveSwipe({ dx: 10, dy: 10 })).toBe("none");
  });

  it("horizontal dominance wins over a small vertical component", () => {
    expect(resolveSwipe({ dx: -(horizontal + 20), dy: 15 })).toBe("next");
  });

  it("a mostly-vertical drag short of the close threshold does nothing (won't nav sideways)", () => {
    expect(resolveSwipe({ dx: 20, dy: down - 20 })).toBe("none");
  });
});
