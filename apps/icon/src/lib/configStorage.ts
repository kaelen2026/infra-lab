import type { PlatformId } from "@/modules/exporting/lib/exportPresets";
import type { IconConfig } from "@/types/icon";
import { parseIconConfigWithSchema, parsePlatformIdsWithSchema } from "./iconConfigSchema";

const STORAGE_KEY = "app-icons:config";

/**
 * Coerce untrusted JSON (localStorage or an imported icon-config.json) into a
 * valid IconConfig. Unknown fields are dropped, bad values fall back to
 * defaults, numbers are clamped to the slider ranges.
 */
export function parseIconConfig(data: unknown): IconConfig | null {
  return parseIconConfigWithSchema(data);
}

/** Platform selection from an exported icon-config.json, if present and valid. */
export function parsePlatformIds(data: unknown): PlatformId[] | null {
  return parsePlatformIdsWithSchema(data);
}

export function loadStoredConfig(): IconConfig | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return parseIconConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveStoredConfig(config: IconConfig): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Quota overflow — usually a large image data URL. Keep the rest.
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...config, imageSrc: null }));
    } catch {
      // Private mode / storage disabled: persistence is best-effort.
    }
  }
}
