import { describe, expect, it } from "vitest";
import { generateConfigVariations } from "@/lib/variations";
import { defaultIconConfig } from "@/types/icon";

describe("generateConfigVariations", () => {
  it("creates stable power-user alternatives without mutating the source config", () => {
    const source = { ...defaultIconConfig };
    const variations = generateConfigVariations(source);

    expect(variations).toHaveLength(6);
    expect(variations.map((variation) => variation.id)).toEqual([
      "color-calm",
      "color-bold",
      "light",
      "shape-next",
      "compact",
      "icon-swap",
    ]);
    expect(source).toEqual(defaultIconConfig);
  });

  it("keeps every variation as a complete IconConfig", () => {
    const sourceKeys = Object.keys(defaultIconConfig).sort();

    for (const variation of generateConfigVariations(defaultIconConfig)) {
      expect(Object.keys(variation.config).sort()).toEqual(sourceKeys);
    }
  });
});
