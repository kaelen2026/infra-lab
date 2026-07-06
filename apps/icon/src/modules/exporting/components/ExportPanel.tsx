"use client";

import type { PlatformId } from "../lib/exportPresets";
import { exportFileList, extraExportFiles, platforms, sizeForPath } from "../lib/exportPresets";
import type { ReadinessCheck, ReadinessReport } from "../lib/readiness";

type Props = {
  exporting: boolean;
  completed: string[];
  readiness: ReadinessReport;
  saved: boolean;
  selected: PlatformId[];
  zipName: string;
  onToggle: (id: PlatformId) => void;
  onSelectAll: (all: boolean) => void;
  onDownload: () => void;
};

function FileRow({ path, label, done }: { path: string; label: string; done: boolean }) {
  const size = sizeForPath(path);
  return (
    <li className="flex items-center gap-2">
      <span
        className={`w-3 text-center transition-colors duration-150 ${
          done ? "text-accent" : "text-text-faint"
        }`}
      >
        {done ? "✓" : "·"}
      </span>
      <span
        className={`min-w-0 flex-1 truncate transition-colors duration-150 ${
          done ? "text-text" : "text-text-dim"
        }`}
      >
        {label}
      </span>
      {size !== null && <span className="tabular-nums text-text-faint">{size}</span>}
    </li>
  );
}

function readinessSummary(report: ReadinessReport) {
  if (report.status === "ready") {
    return `ready · ${report.checks.length} checks`;
  }

  const reviewCount = report.checks.filter((check) => check.severity !== "pass").length;
  const itemLabel = reviewCount === 1 ? "item needs" : "items need";

  return `${report.status} · ${reviewCount} ${itemLabel} review`;
}

function readinessSeverityClass(severity: ReadinessCheck["severity"]) {
  if (severity === "issue") {
    return "text-red-400";
  }

  if (severity === "warning") {
    return "text-amber-400";
  }

  return "text-accent";
}

function ReadinessSection({ report }: { report: ReadinessReport }) {
  const reviewChecks = report.checks.filter((check) => check.severity !== "pass");
  const visibleChecks =
    reviewChecks.length > 0
      ? reviewChecks.slice(0, 4)
      : report.checks.filter((check) => check.severity === "pass").slice(0, 3);

  return (
    <div className="border-t border-hairline pt-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] tracking-[0.18em] text-text-faint">readiness</h2>
        <p className="text-right text-[11px] text-text-dim">{readinessSummary(report)}</p>
      </div>
      <ul className="mt-2 space-y-1.5 text-[11px]">
        {visibleChecks.map((check) => (
          <li key={check.id} className="rounded-sm border border-hairline bg-panel-2 px-2 py-1.5">
            <div className="flex items-baseline gap-2">
              <span className={`shrink-0 tabular-nums ${readinessSeverityClass(check.severity)}`}>
                {check.severity}
              </span>
              <span className="min-w-0 flex-1 text-text">{check.title}</span>
            </div>
            <p className="mt-0.5 text-text-dim">{check.detail}</p>
            {check.platformIds !== undefined && check.platformIds.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {check.platformIds.map((platformId) => (
                  <span key={platformId} className="border border-hairline px-1 text-text-faint">
                    {platformId}
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ExportPanel({
  exporting,
  completed,
  readiness,
  saved,
  selected,
  zipName,
  onToggle,
  onSelectAll,
  onDownload,
}: Props) {
  const fileList = exportFileList(selected);
  const none = selected.length === 0;
  const allSelected = selected.length === platforms.length;

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[11px] tracking-[0.18em] text-text-faint">platforms</h2>
        <button
          type="button"
          disabled={exporting}
          onClick={() => onSelectAll(!allSelected)}
          className="min-h-11 text-[11px] text-text-dim transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-0"
        >
          {allSelected ? "clear all" : "select all"}
        </button>
      </div>
      <ul className="space-y-1.5">
        {platforms.map((platform) => {
          const checked = selected.includes(platform.id);
          const count =
            platform.files.length +
            (platform.icoFiles?.length ?? 0) +
            (platform.staticFiles?.length ?? 0);
          return (
            <li key={platform.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[11px] sm:min-h-0 sm:items-baseline">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={exporting}
                  onChange={() => onToggle(platform.id)}
                  className="size-4 accent-accent sm:relative sm:top-px sm:size-3"
                />
                <span className={checked ? "text-text" : "text-text-dim"}>{platform.label}</span>
                <span className="min-w-0 flex-1 truncate text-text-faint">
                  {platform.description}
                </span>
                <span className="tabular-nums text-text-faint">{count}</span>
              </label>
            </li>
          );
        })}
      </ul>

      <ReadinessSection report={readiness} />

      <h2 className="border-t border-hairline pt-3 text-[11px] tracking-[0.18em] text-text-faint">
        manifest
      </h2>
      <div className="space-y-2 text-[11px]">
        {platforms
          .filter((p) => selected.includes(p.id))
          .map((platform) => {
            const paths = [
              ...platform.files.map((f) => f.path),
              ...(platform.icoFiles ?? []).map((f) => f.path),
              ...(platform.staticFiles ?? []).map((f) => f.path),
            ];
            return (
              <div key={platform.id}>
                <p className="pb-0.5 text-text-faint">{platform.id}/</p>
                <ul className="space-y-0.5">
                  {paths.map((path) => (
                    <FileRow
                      key={path}
                      path={path}
                      label={path.slice(platform.id.length + 1)}
                      done={completed.includes(path)}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        {!none && (
          <ul className="space-y-0.5">
            {extraExportFiles.map((path) => (
              <FileRow key={path} path={path} label={path} done={completed.includes(path)} />
            ))}
          </ul>
        )}
      </div>

      <p className="border-t border-hairline pt-3 text-[11px] text-text-faint">
        {saved ? (
          <span className="text-accent">{zipName} ✓ saved</span>
        ) : exporting ? (
          `rendering ${completed.length}/${fileList.length}…`
        ) : none ? (
          "no platforms selected"
        ) : (
          `${fileList.length} files · ${selected.join(" + ")}`
        )}
      </p>
      <button
        type="button"
        onClick={onDownload}
        disabled={exporting || none}
        className="min-h-12 w-full rounded-sm bg-accent px-4 py-2 text-xs font-medium text-ink transition-all hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-0"
      >
        {exporting ? "rendering…" : "download .zip"}
      </button>
    </section>
  );
}
