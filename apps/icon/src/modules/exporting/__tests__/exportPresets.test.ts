import { describe, expect, it } from "vitest";
import { defaultIconConfig } from "@/types/icon";
import { exportFileList, platforms, sizeForPath } from "../lib/exportPresets";

describe("export preset registry", () => {
  it("builds ZIP file lists in registry order with metadata files last", () => {
    expect(exportFileList(["web"])).toEqual([
      "web/favicon-16x16.png",
      "web/favicon-32x32.png",
      "web/apple-touch-icon.png",
      "web/favicon.ico",
      "README.md",
      "icon-config.json",
    ]);
  });

  it("reports pixel sizes only for rendered assets", () => {
    expect(sizeForPath("web/favicon-32x32.png")).toBe(32);
    expect(sizeForPath("web/favicon.ico")).toBeNull();
    expect(sizeForPath("unknown.png")).toBeNull();
  });

  it("generates a PWA manifest from the current app name", () => {
    const webapp = platforms.find((platform) => platform.id === "webapp");
    const manifest = webapp?.staticFiles?.[0]?.content({
      ...defaultIconConfig,
      appName: "Client App",
    });

    expect(JSON.parse(manifest ?? "{}")).toMatchObject({
      name: "Client App",
      short_name: "Client App",
      icons: expect.arrayContaining([expect.objectContaining({ purpose: "maskable" })]),
    });
  });
});
