import { describe, expect, it } from "vitest";
import { buildLucideSvg, lucideSvgDataUrl, toKebab } from "@/lib/lucide";

describe("lucide helpers", () => {
  it("formats PascalCase icon names for search", () => {
    expect(toKebab("ArrowRight")).toBe("arrow-right");
    expect(toKebab("Badge3d")).toBe("badge3d");
  });

  it("serializes known icons into recolored SVGs", () => {
    const svg = buildLucideSvg("Rocket", "#4ade80", 2.5);

    expect(svg).toContain('stroke="#4ade80"');
    expect(svg).toContain('stroke-width="2.5"');
    expect(svg).toContain("<svg");
  });

  it("returns null for unknown icons", () => {
    expect(buildLucideSvg("DefinitelyMissing", "#fff")).toBeNull();
    expect(lucideSvgDataUrl("DefinitelyMissing", "#fff")).toBeNull();
  });

  it("encodes SVGs as image data URLs", () => {
    const dataUrl = lucideSvgDataUrl("Rocket", "#4ade80");

    expect(dataUrl).toMatch(/^data:image\/svg\+xml,/);
    expect(decodeURIComponent(dataUrl?.split(",")[1] ?? "")).toContain('stroke="#4ade80"');
  });
});
