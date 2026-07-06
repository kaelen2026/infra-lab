import { describe, expect, it } from "vitest";
import { parseIconConfigWithSchema, parsePlatformIdsWithSchema } from "@/lib/iconConfigSchema";
import { defaultIconConfig } from "@/types/icon";

describe("parseIconConfigWithSchema", () => {
  it("rejects unrelated JSON before applying defaults", () => {
    expect(parseIconConfigWithSchema({ hello: "world" })).toBeNull();
  });

  it("clamps numeric fields and falls back for invalid colors", () => {
    expect(
      parseIconConfigWithSchema({
        ...defaultIconConfig,
        bgColor1: "green",
        iconStroke: 42,
        offsetY: -200,
        rotation: 999,
      }),
    ).toMatchObject({
      bgColor1: defaultIconConfig.bgColor1,
      iconStroke: 3,
      offsetY: -100,
      rotation: 180,
    });
  });

  it("keeps only durable image data URLs", () => {
    expect(
      parseIconConfigWithSchema({
        ...defaultIconConfig,
        fgMode: "image",
        imageSrc: "blob:http://localhost/image",
      })?.imageSrc,
    ).toBeNull();

    expect(
      parseIconConfigWithSchema({
        ...defaultIconConfig,
        fgMode: "image",
        imageSrc: "data:image/png;base64,abc",
      })?.imageSrc,
    ).toBe("data:image/png;base64,abc");
  });
});

describe("parsePlatformIdsWithSchema", () => {
  it("normalizes platform ids to registry order", () => {
    expect(
      parsePlatformIdsWithSchema({
        platforms: ["desktop", "ios", "unknown", "android"],
      }),
    ).toEqual(["ios", "android", "desktop"]);
  });
});
