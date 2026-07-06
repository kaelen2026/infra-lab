import { useCallback, useEffect, useRef, useState } from "react";
import type { IconConfig } from "@/types/icon";
import type { PlatformId } from "../lib/exportPresets";
import { exportFileList } from "../lib/exportPresets";
import { exportZip as defaultExportZip, zipFileName } from "../lib/exportZip";

type ExportZip = typeof defaultExportZip;

type Options = {
  config: IconConfig;
  exportZip?: ExportZip;
  markStaggerMs?: number;
  saveBlob: (blob: Blob, fileName: string) => void;
  selected: PlatformId[];
  trackExport: (selected: PlatformId[]) => void;
};

type UseIconExportResult = {
  completed: string[];
  download: () => Promise<void>;
  exportError: string | null;
  exporting: boolean;
  resetExportStatus: () => void;
  saved: boolean;
  zipName: string;
};

export function useIconExport({
  config,
  exportZip = defaultExportZip,
  markStaggerMs = 70,
  saveBlob,
  selected,
  trackExport,
}: Options): UseIconExportResult {
  const [exporting, setExporting] = useState(false);
  const [completed, setCompleted] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const markTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearMarkTimers = useCallback(() => {
    markTimers.current.forEach(clearTimeout);
    markTimers.current = [];
  }, []);

  useEffect(() => clearMarkTimers, [clearMarkTimers]);

  const resetExportStatus = useCallback(() => {
    clearMarkTimers();
    setCompleted([]);
    setSaved(false);
    setExportError(null);
  }, [clearMarkTimers]);

  const download = useCallback(async () => {
    setExporting(true);
    setSaved(false);
    setExportError(null);
    setCompleted([]);
    clearMarkTimers();

    const start = performance.now();
    let index = 0;
    try {
      const blob = await exportZip(config, selected, (path) => {
        const at = index * markStaggerMs;
        index++;
        const delay = Math.max(0, at - (performance.now() - start));
        markTimers.current.push(setTimeout(() => setCompleted((prev) => [...prev, path]), delay));
      });
      const lastMark = exportFileList(selected).length * markStaggerMs;
      const remaining = Math.max(0, lastMark - (performance.now() - start));
      await new Promise((resolve) => setTimeout(resolve, remaining));
      saveBlob(blob, zipFileName(config));
      setSaved(true);
      trackExport(selected);
    } catch (err) {
      clearMarkTimers();
      setExportError(err instanceof Error ? err.message : "export failed. retry.");
    } finally {
      setExporting(false);
    }
  }, [clearMarkTimers, config, exportZip, markStaggerMs, saveBlob, selected, trackExport]);

  return {
    completed,
    download,
    exportError,
    exporting,
    resetExportStatus,
    saved,
    zipName: zipFileName(config),
  };
}
