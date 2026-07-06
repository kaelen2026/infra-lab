import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlatformId } from "@/modules/exporting";
import { defaultIconConfig } from "@/types/icon";
import { useIconExport } from "../hooks/useIconExport";

describe("useIconExport", () => {
  it("tracks completed files and saves the exported blob", async () => {
    const saveBlob = vi.fn();
    const trackExport = vi.fn();
    const exportZip = vi.fn(async (_config, _selected, onProgress) => {
      onProgress?.("web/favicon-16x16.png");
      return new Blob(["zip"]);
    });

    const { result } = renderHook(() =>
      useIconExport({
        config: defaultIconConfig,
        exportZip,
        markStaggerMs: 0,
        saveBlob,
        selected: ["web"],
        trackExport,
      }),
    );

    await act(async () => {
      await result.current.download();
    });

    await waitFor(() => expect(result.current.saved).toBe(true));
    expect(result.current.completed).toContain("web/favicon-16x16.png");
    expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "my-app-icons.zip");
    expect(trackExport).toHaveBeenCalledWith(["web"]);
  });

  it("surfaces export failures", async () => {
    const selected: PlatformId[] = ["web"];
    const { result } = renderHook(() =>
      useIconExport({
        config: defaultIconConfig,
        exportZip: vi.fn(async () => {
          throw new Error("zip failed");
        }),
        markStaggerMs: 0,
        saveBlob: vi.fn(),
        selected,
        trackExport: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.download();
    });

    expect(result.current.exportError).toBe("zip failed");
    expect(result.current.exporting).toBe(false);
    expect(result.current.saved).toBe(false);
  });
});
