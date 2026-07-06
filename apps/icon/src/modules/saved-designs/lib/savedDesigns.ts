import { parseIconConfig } from "@/lib/configStorage";
import type { IconConfig } from "@/types/icon";

const STORAGE_KEY = "app-icons:saved-designs";
const MAX_SAVED_DESIGNS = 12;

export type SavedDesign = {
  id: string;
  name: string;
  createdAt: number;
  config: IconConfig;
};

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseSavedDesign(data: unknown): SavedDesign | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const config = parseIconConfig(d.config);
  if (!config) return null;
  return {
    id: typeof d.id === "string" ? d.id : createId(),
    name: typeof d.name === "string" && d.name.trim() ? d.name : config.appName,
    createdAt:
      typeof d.createdAt === "number" && Number.isFinite(d.createdAt) ? d.createdAt : Date.now(),
    config,
  };
}

export function loadSavedDesigns(): SavedDesign[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseSavedDesign)
      .filter((design): design is SavedDesign => design !== null)
      .slice(0, MAX_SAVED_DESIGNS);
  } catch {
    return [];
  }
}

export function saveSavedDesigns(designs: SavedDesign[]): void {
  const cappedDesigns = designs.slice(0, MAX_SAVED_DESIGNS);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cappedDesigns));
  } catch {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stripImageSources(cappedDesigns)));
    } catch {
      // Saved designs are convenience state; failure should never block editing.
    }
  }
}

export function createSavedDesign(config: IconConfig): SavedDesign {
  return {
    id: createId(),
    name: config.appName.trim() || "untitled",
    createdAt: Date.now(),
    config,
  };
}

function stripImageSources(designs: SavedDesign[]): SavedDesign[] {
  return designs.map((design) => ({
    ...design,
    config: { ...design.config, imageSrc: null },
  }));
}
