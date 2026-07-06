import { describe, expect, it } from "vitest";
import { parseIconConfig, parsePlatformIds } from "@/lib/configStorage";
import { defaultIconConfig } from "@/types/icon";

describe("parseIconConfig", () => {
  it("rejects unrelated JSON instead of silently resetting", () => {
    expect(parseIconConfig({ hello: "world" })).toBeNull();
  });

  it("sanitizes imported configs into safe slider and color ranges", () => {
    const parsed = parseIconConfig({
      ...defaultIconConfig,
      bgColor1: "not-a-color",
      iconStroke: 99,
      offsetX: -999,
      scale: 500,
    });

    expect(parsed).toMatchObject({
      bgColor1: defaultIconConfig.bgColor1,
      iconStroke: 3,
      offsetX: -100,
      scale: 120,
    });
  });
});

describe("parsePlatformIds", () => {
  it("keeps platform selections in registry order and drops unknown ids", () => {
    expect(
      parsePlatformIds({
        platforms: ["webapp", "unknown", "ios", "web"],
      }),
    ).toEqual(["ios", "web", "webapp"]);
  });
});
