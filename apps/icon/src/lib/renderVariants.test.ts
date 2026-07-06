import { describe, expect, it } from "vitest";
import { getRenderVariantSpec } from "@/lib/renderVariants";

describe("getRenderVariantSpec", () => {
  it("describes platform safe-zone variants as data", () => {
    expect(getRenderVariantSpec("maskable")).toMatchObject({
      background: true,
      foreground: true,
      fgScale: 0.8,
    });
    expect(getRenderVariantSpec("monochrome")).toMatchObject({
      background: false,
      monochrome: true,
    });
    expect(getRenderVariantSpec("iosTinted")).toMatchObject({
      grayscale: true,
    });
  });
});
