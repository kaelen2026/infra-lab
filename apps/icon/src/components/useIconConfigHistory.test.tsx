import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useIconConfigHistory } from "@/components/useIconConfigHistory";
import { defaultIconConfig } from "@/types/icon";

describe("useIconConfigHistory", () => {
  it("commits patches and navigates undo/redo history", () => {
    const { result } = renderHook(() => useIconConfigHistory(defaultIconConfig));

    act(() => result.current.commitConfig({ appName: "client" }));
    expect(result.current.config.appName).toBe("client");
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);

    act(() => result.current.undo());
    expect(result.current.config.appName).toBe(defaultIconConfig.appName);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(result.current.config.appName).toBe("client");
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it("clears redo history when a new patch is committed after undo", () => {
    const { result } = renderHook(() => useIconConfigHistory(defaultIconConfig));

    act(() => result.current.commitConfig({ appName: "first" }));
    act(() => result.current.commitConfig({ appName: "second" }));
    act(() => result.current.undo());
    expect(result.current.config.appName).toBe("first");
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.commitConfig({ appName: "third" }));
    expect(result.current.config.appName).toBe("third");
    expect(result.current.canRedo).toBe(false);
  });
});
