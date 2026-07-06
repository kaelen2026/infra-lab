import { useCallback, useEffect, useState } from "react";
import type { IconConfig } from "@/types/icon";
import {
  createSavedDesign,
  loadSavedDesigns,
  type SavedDesign,
  saveSavedDesigns,
} from "../lib/savedDesigns";

export function useSavedDesigns() {
  const [savedDesigns, setSavedDesigns] = useState<SavedDesign[]>(() => loadSavedDesigns());

  useEffect(() => {
    saveSavedDesigns(savedDesigns);
  }, [savedDesigns]);

  const saveDesign = useCallback((config: IconConfig) => {
    setSavedDesigns((prev) => [createSavedDesign(config), ...prev].slice(0, 12));
  }, []);

  const deleteDesign = useCallback((id: string) => {
    setSavedDesigns((prev) => prev.filter((design) => design.id !== id));
  }, []);

  return { deleteDesign, saveDesign, savedDesigns };
}
