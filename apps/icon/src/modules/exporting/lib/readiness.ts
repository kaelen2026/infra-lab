import type { IconConfig } from "@/types/icon";
import { type PlatformId, platforms } from "./exportPresets";

export type ReadinessSeverity = "pass" | "warning" | "issue";

export type ReadinessCheck = {
  id: string;
  severity: ReadinessSeverity;
  title: string;
  detail: string;
  platformIds?: PlatformId[];
};

export type ReadinessReport = {
  status: "ready" | "warnings" | "issues";
  checks: ReadinessCheck[];
};

const SAFE_ZONE_PLATFORM_IDS = new Set<PlatformId>(["android", "harmony", "webapp", "expo"]);

const CONTRAST_WARNING_THRESHOLD = 3;

const platformIdSet = new Set<string>(platforms.map((platform) => platform.id));

export function getReadinessReport(
  config: IconConfig,
  selected: readonly string[],
): ReadinessReport {
  const checks: ReadinessCheck[] = [];
  const knownSelected = selected.filter(isKnownPlatformId);
  const hasUnknownSelection = knownSelected.length !== selected.length;

  if (selected.length === 0) {
    checks.push({
      id: "platform-selection",
      severity: "issue",
      title: "Select at least one export target",
      detail: "Choose a platform before exporting the icon package.",
    });
  } else if (hasUnknownSelection) {
    checks.push({
      id: "platform-selection",
      severity: "issue",
      title: "Unknown export target selected",
      detail: "Remove unsupported platforms before exporting.",
      platformIds: knownSelected,
    });
  } else {
    checks.push({
      id: "platform-selection",
      severity: "pass",
      title: "Export targets selected",
      detail: "All selected platforms are available in the export registry.",
      platformIds: knownSelected,
    });
  }

  const safeZonePlatformIds = knownSelected.filter((platformId) =>
    SAFE_ZONE_PLATFORM_IDS.has(platformId),
  );
  if (safeZonePlatformIds.length > 0 && hasSafeZoneRisk(config)) {
    checks.push({
      id: "safe-zone-risk",
      severity: "warning",
      title: "Foreground may exceed platform safe zones",
      detail:
        "Large scale, offset, or rotation values can be clipped by adaptive and maskable icon surfaces.",
      platformIds: safeZonePlatformIds,
    });
  }

  if (knownSelected.includes("web") && config.fgMode === "text" && config.text.trim().length > 3) {
    checks.push({
      id: "small-text-legibility",
      severity: "warning",
      title: "Text may be unreadable at favicon sizes",
      detail: "Shorten text to three characters or fewer for tiny web favicon exports.",
      platformIds: ["web"],
    });
  }

  if (knownSelected.length > 0 && hasContrastRisk(config)) {
    checks.push({
      id: "contrast-risk",
      severity: "warning",
      title: "Foreground and background contrast is low",
      detail:
        "Use a stronger foreground color contrast so the icon remains recognizable at small sizes.",
      platformIds: knownSelected,
    });
  }

  if (knownSelected.length > 0) {
    checks.push({
      id: "registry-export-shape",
      severity: "pass",
      title: "Export files are registered",
      detail: "The export registry has output files for the selected platforms.",
      platformIds: knownSelected,
    });
  }

  return {
    status: statusForChecks(checks),
    checks,
  };
}

function isKnownPlatformId(platformId: string): platformId is PlatformId {
  return platformIdSet.has(platformId);
}

function hasSafeZoneRisk(config: IconConfig): boolean {
  return (
    config.scale > 72 ||
    Math.abs(config.offsetX) > 12 ||
    Math.abs(config.offsetY) > 12 ||
    Math.abs(config.rotation) > 12
  );
}

function hasContrastRisk(config: IconConfig): boolean {
  const foregroundColor =
    config.fgMode === "text"
      ? config.textColor
      : config.fgMode === "icon"
        ? config.iconColor
        : null;

  if (foregroundColor === null) {
    return false;
  }

  const foreground = hexToRgb(foregroundColor);
  const backgroundColors =
    config.bgType === "solid" ? [config.bgColor1] : [config.bgColor1, config.bgColor2];

  if (foreground === null) {
    return false;
  }

  return backgroundColors.some((color) => {
    const background = hexToRgb(color);
    return (
      background !== null && contrastRatio(foreground, background) < CONTRAST_WARNING_THRESHOLD
    );
  });
}

function hexToRgb(hex: string): [number, number, number] | null {
  const normalized = hex.trim().replace(/^#/, "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalized;

  if (!/^[\da-f]{6}$/i.test(expanded)) {
    return null;
  }

  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
  ];
}

function contrastRatio(
  [r1, g1, b1]: [number, number, number],
  [r2, g2, b2]: [number, number, number],
): number {
  const lighter = Math.max(luminance(r1, g1, b1), luminance(r2, g2, b2));
  const darker = Math.min(luminance(r1, g1, b1), luminance(r2, g2, b2));

  return (lighter + 0.05) / (darker + 0.05);
}

function luminance(red: number, green: number, blue: number): number {
  const r = toLinear(red);
  const g = toLinear(green);
  const b = toLinear(blue);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function toLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function statusForChecks(checks: ReadinessCheck[]): ReadinessReport["status"] {
  if (checks.some((check) => check.severity === "issue")) {
    return "issues";
  }

  if (checks.some((check) => check.severity === "warning")) {
    return "warnings";
  }

  return "ready";
}
