"use client";

import { track } from "@vercel/analytics";
import { saveAs } from "file-saver";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BackgroundPanel from "@/components/BackgroundPanel";
import ForegroundPanel from "@/components/ForegroundPanel";
import IconPreview from "@/components/IconPreview";
import ShapePanel from "@/components/ShapePanel";
import TransformPanel from "@/components/TransformPanel";
import { useIconConfigHistory } from "@/components/useIconConfigHistory";
import { useImportConfig } from "@/components/useImportConfig";
import VariationPanel from "@/components/VariationPanel";
import { loadStoredConfig, saveStoredConfig } from "@/lib/configStorage";
import { randomStylePatch } from "@/lib/presets";
import {
  allPlatformIds,
  ExportPanel,
  getReadinessReport,
  type PlatformId,
  useIconExport,
} from "@/modules/exporting";
import { SavedDesignsPanel, useSavedDesigns } from "@/modules/saved-designs";
import type { IconConfig } from "@/types/icon";
import { defaultIconConfig } from "@/types/icon";

// Rendered with ssr:false (see StudioLoader), so localStorage is readable in
// the lazy initializer and the stored design lands in the very first render.
export default function IconStudio({ initialPlatforms }: { initialPlatforms?: PlatformId[] }) {
  const [initialConfig] = useState<IconConfig>(() => loadStoredConfig() ?? defaultIconConfig);
  const { canRedo, canUndo, commitConfig, config, redo, undo } =
    useIconConfigHistory(initialConfig);
  const { deleteDesign, saveDesign, savedDesigns } = useSavedDesigns();
  const [selected, setSelected] = useState<PlatformId[]>(initialPlatforms ?? allPlatformIds);
  const importInputRef = useRef<HTMLInputElement>(null);
  const {
    completed,
    download: handleDownload,
    exportError,
    exporting,
    resetExportStatus,
    saved,
    zipName,
  } = useIconExport({
    config,
    saveBlob: saveAs,
    selected,
    trackExport: (platforms) => track("export", { platforms: platforms.join(",") }),
  });
  const readiness = useMemo(() => getReadinessReport(config, selected), [config, selected]);

  useEffect(() => {
    // Debounced: config changes per keystroke / slider tick, and imageSrc can
    // be a multi-MB data URL — serializing every change would jank the canvas
    const timer = setTimeout(() => saveStoredConfig(config), 300);
    return () => clearTimeout(timer);
  }, [config]);

  const togglePlatform = useCallback((id: PlatformId) => {
    // filter against the registry so the selection keeps canonical order
    setSelected((prev) =>
      allPlatformIds.filter((p) => (p === id ? !prev.includes(p) : prev.includes(p))),
    );
  }, []);

  const selectAllPlatforms = useCallback((all: boolean) => {
    setSelected(all ? allPlatformIds : []);
  }, []);

  const commitDesign = useCallback(
    (next: IconConfig | Partial<IconConfig>) => {
      commitConfig(next);
      resetExportStatus();
    },
    [commitConfig, resetExportStatus],
  );

  const {
    clearImportNote,
    importFile: handleImportFile,
    importNote,
  } = useImportConfig({
    onImportConfig: commitDesign,
    onImportPlatforms: setSelected,
  });

  const applyDesign = useCallback(
    (next: IconConfig | Partial<IconConfig>) => {
      commitDesign(next);
      clearImportNote();
    },
    [clearImportNote, commitDesign],
  );

  const update = useCallback(
    (patch: Partial<IconConfig>) => {
      applyDesign(patch);
    },
    [applyDesign],
  );

  const saveCurrentDesign = useCallback(() => {
    saveDesign(config);
  }, [config, saveDesign]);

  const handleReset = useCallback(() => {
    applyDesign(defaultIconConfig);
  }, [applyDesign]);

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
      <header className="sticky top-0 z-20 flex shrink-0 flex-col gap-3 border-b border-hairline bg-ink px-4 py-3 sm:grid sm:h-12 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-4 sm:px-5 sm:py-0 lg:static">
        <div className="min-w-0 truncate text-sm text-text">
          app_icons{" "}
          <span className="text-[10px] text-text-faint">v0.1 · ios + android + web icon packs</span>
        </div>
        <label className="flex w-full items-center gap-3 justify-self-center sm:w-56 xl:w-72">
          <span className="shrink-0 text-[11px] tracking-[0.18em] text-text-faint">app_name</span>
          <input
            type="text"
            value={config.appName}
            onChange={(e) => update({ appName: e.target.value })}
            placeholder="my-app"
            className="min-h-11 min-w-0 flex-1 rounded-sm border border-hairline bg-panel-2 px-3 py-2 text-base text-text outline-none transition-colors focus:border-accent sm:text-xs"
          />
        </label>
        <div className="grid grid-cols-4 items-center gap-2 sm:flex sm:justify-end">
          {importNote && (
            <span className={`text-[11px] ${importNote.error ? "text-red-400" : "text-amber-400"}`}>
              {importNote.text}
            </span>
          )}
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              handleImportFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => update(randomStylePatch())}
            title="random style: preset × icon × shape"
            className="min-h-11 rounded-sm border border-hairline px-3 py-2 text-[11px] text-text-dim transition-all hover:border-hairline-bright hover:text-text active:scale-[0.97]"
          >
            random
          </button>
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            title="undo last design change"
            className="min-h-11 rounded-sm border border-hairline px-3 py-2 text-[11px] text-text-dim transition-all hover:border-hairline-bright hover:text-text active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
          >
            undo
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            title="redo design change"
            className="min-h-11 rounded-sm border border-hairline px-3 py-2 text-[11px] text-text-dim transition-all hover:border-hairline-bright hover:text-text active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
          >
            redo
          </button>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            title="restore a design from an exported icon-config.json"
            className="min-h-11 rounded-sm border border-hairline px-3 py-2 text-[11px] text-text-dim transition-all hover:border-hairline-bright hover:text-text active:scale-[0.97]"
          >
            import
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="min-h-11 rounded-sm border border-hairline px-3 py-2 text-[11px] text-text-dim transition-all hover:border-hairline-bright hover:text-text active:scale-[0.97]"
          >
            reset
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={exporting || selected.length === 0}
            className="min-h-11 rounded-sm bg-accent px-3 py-2 text-[11px] font-medium text-ink transition-all hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {exporting ? "rendering…" : "download .zip"}
          </button>
        </div>
      </header>

      <main className="grid min-w-0 flex-1 lg:min-h-0 lg:grid-cols-[300px_1fr_280px]">
        {/* left: controls */}
        <aside className="order-2 border-b border-hairline lg:order-none lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="divide-y divide-hairline">
            <div className="p-5">
              <VariationPanel config={config} onApply={applyDesign} />
            </div>
            <div className="p-5">
              <SavedDesignsPanel
                designs={savedDesigns}
                onSave={saveCurrentDesign}
                onRestore={(design) => applyDesign(design.config)}
                onDelete={deleteDesign}
              />
            </div>
            <div className="p-5">
              <ForegroundPanel config={config} onChange={update} />
            </div>
            <div className="p-5">
              <BackgroundPanel config={config} onChange={update} />
            </div>
            <div className="p-5">
              <ShapePanel config={config} onChange={update} />
            </div>
            <div className="p-5">
              <TransformPanel config={config} onChange={update} />
            </div>
          </div>
        </aside>

        {/* center: preview + context wall */}
        <section className="order-1 min-w-0 overflow-hidden border-b border-hairline lg:order-none lg:min-h-0 lg:border-b-0">
          <IconPreview config={config} />
        </section>

        {/* right: manifest + export */}
        <aside className="order-3 lg:order-none lg:overflow-y-auto lg:border-l lg:border-hairline">
          <div className="p-5">
            <ExportPanel
              exporting={exporting}
              completed={completed}
              saved={saved}
              readiness={readiness}
              selected={selected}
              zipName={zipName}
              onToggle={togglePlatform}
              onSelectAll={selectAllPlatforms}
              onDownload={handleDownload}
            />
            {exportError && <p className="mt-3 text-[11px] text-red-400">{exportError}</p>}
          </div>
        </aside>
      </main>
    </div>
  );
}
