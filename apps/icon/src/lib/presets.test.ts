import { afterEach, describe, expect, it, vi } from "vitest";
import { presetPatch, randomStylePatch, stylePresets } from "@/lib/presets";

describe("style presets", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies the preset background and foreground colors together", () => {
    const preset = stylePresets[0];
    if (!preset) throw new Error("missing first preset");
    expect(presetPatch(preset)).toEqual({
      ...preset.patch,
      iconColor: preset.fgColor,
      textColor: preset.fgColor,
    });
  });

  it("builds a random icon-mode patch from curated options", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const preset = stylePresets[0];
    if (!preset) throw new Error("missing first preset");
    expect(randomStylePatch()).toMatchObject({
      ...preset.patch,
      iconColor: preset.fgColor,
      textColor: preset.fgColor,
      fgMode: "icon",
      iconName: "Rocket",
      shape: "rounded",
    });
  });
});
