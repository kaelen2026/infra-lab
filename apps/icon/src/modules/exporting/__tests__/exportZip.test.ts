import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { defaultIconConfig } from "@/types/icon";
import { exportZip, zipFileName } from "../lib/exportZip";

vi.mock("@/lib/renderIcon", () => ({
  renderIcon: vi.fn(
    async (_config, size: number, variant: string) =>
      new Blob([`png:${size}:${variant}`], { type: "image/png" }),
  ),
}));

describe("exportZip", () => {
  it("sanitizes zip filenames from app names", () => {
    expect(zipFileName({ ...defaultIconConfig, appName: " Client / App:*? " })).toBe(
      "Client-App-icons.zip",
    );
    expect(zipFileName({ ...defaultIconConfig, appName: "   " })).toBe("app-icons.zip");
  });

  it("packages selected platform assets, metadata, and progress in order", async () => {
    const progress: string[] = [];
    const blob = await exportZip(
      {
        ...defaultIconConfig,
        appName: "Client App",
        imageSrc: "data:image/png;base64,source",
      },
      ["web"],
      (path) => progress.push(path),
    );
    const zip = await JSZip.loadAsync(blob);

    expect(
      Object.entries(zip.files)
        .filter(([, file]) => !file.dir)
        .map(([path]) => path)
        .sort(),
    ).toEqual(
      [
        "README.md",
        "icon-config.json",
        "web/apple-touch-icon.png",
        "web/favicon-16x16.png",
        "web/favicon-32x32.png",
        "web/favicon.ico",
      ].sort(),
    );
    expect(progress).toEqual([
      "web/favicon-16x16.png",
      "web/favicon-32x32.png",
      "web/apple-touch-icon.png",
      "web/favicon.ico",
      "README.md",
      "icon-config.json",
    ]);
    await expect(zip.file("README.md")?.async("string")).resolves.toContain("# Client App");
    await expect(
      zip.file("icon-config.json")?.async("string").then(JSON.parse),
    ).resolves.toMatchObject({
      appName: "Client App",
      hasImage: true,
      platforms: ["web"],
    });
    expect(await zip.file("web/favicon-16x16.png")?.async("string")).toBe("png:16:masked");
    const icoFile = zip.file("web/favicon.ico");
    if (!icoFile) throw new Error("favicon.ico missing from zip");
    const ico = new DataView(await icoFile.async("arraybuffer"));
    expect(ico.getUint16(0, true)).toBe(0);
    expect(ico.getUint16(2, true)).toBe(1);
    expect(ico.getUint16(4, true)).toBe(3);
  });
});
