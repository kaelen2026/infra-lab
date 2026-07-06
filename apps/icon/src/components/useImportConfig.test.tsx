import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useImportConfig } from "@/components/useImportConfig";
import { defaultIconConfig, type IconConfig } from "@/types/icon";

describe("useImportConfig", () => {
  it("imports config, platform ids, and image restore note", async () => {
    const onImportConfig = vi.fn();
    const onImportPlatforms = vi.fn();
    const file = new File(
      [
        JSON.stringify({
          ...defaultIconConfig,
          appName: "imported",
          fgMode: "image",
          imageSrc: null,
          platforms: ["webapp"],
        }),
      ],
      "icon-config.json",
    );

    const { result } = renderHook(() => useImportConfig({ onImportConfig, onImportPlatforms }));

    await act(async () => {
      await result.current.importFile(file);
    });

    expect(onImportConfig).toHaveBeenCalledWith(
      expect.objectContaining<Partial<IconConfig>>({ appName: "imported" }),
    );
    expect(onImportPlatforms).toHaveBeenCalledWith(["webapp"]);
    expect(result.current.importNote).toEqual({
      text: "config imported — re-upload the source image",
      error: false,
    });
  });

  it("surfaces invalid import files", async () => {
    const { result } = renderHook(() =>
      useImportConfig({
        onImportConfig: vi.fn(),
        onImportPlatforms: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.importFile(new File(["nope"], "bad.json"));
    });

    expect(result.current.importNote).toEqual({
      text: "not a valid icon-config.json",
      error: true,
    });
  });
});
