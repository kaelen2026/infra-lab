import { useCallback, useState } from "react";
import type { IconConfig } from "@/types/icon";

const HISTORY_LIMIT = 30;

function sameConfig(a: IconConfig, b: IconConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useIconConfigHistory(initialConfig: IconConfig) {
  const [config, setConfig] = useState<IconConfig>(initialConfig);
  const [history, setHistory] = useState<{
    past: IconConfig[];
    future: IconConfig[];
  }>({ past: [], future: [] });

  const commitConfig = useCallback((next: IconConfig | Partial<IconConfig>) => {
    setConfig((prev) => {
      const nextConfig =
        "fgMode" in next && "appName" in next ? (next as IconConfig) : { ...prev, ...next };
      if (sameConfig(prev, nextConfig)) return prev;
      setHistory((current) => ({
        past: [...current.past.slice(-(HISTORY_LIMIT - 1)), prev],
        future: [],
      }));
      return nextConfig;
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((current) => {
      if (current.past.length === 0) return current;
      const previous = current.past[current.past.length - 1];
      setConfig((currentConfig) => previous ?? currentConfig);
      return {
        past: current.past.slice(0, -1),
        future: [config, ...current.future].slice(0, HISTORY_LIMIT),
      };
    });
  }, [config]);

  const redo = useCallback(() => {
    setHistory((current) => {
      if (current.future.length === 0) return current;
      const next = current.future[0];
      setConfig((currentConfig) => next ?? currentConfig);
      return {
        past: [...current.past.slice(-(HISTORY_LIMIT - 1)), config],
        future: current.future.slice(1),
      };
    });
  }, [config]);

  return {
    config,
    commitConfig,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
