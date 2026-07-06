import { useCallback, useState } from "react";
import { parseIconConfig, parsePlatformIds } from "@/lib/configStorage";
import type { PlatformId } from "@/modules/exporting/lib/exportPresets";
import type { IconConfig } from "@/types/icon";

type ImportNote = {
  text: string;
  error: boolean;
};

type Options = {
  onImportConfig: (config: IconConfig) => void;
  onImportPlatforms: (ids: PlatformId[]) => void;
};

export function useImportConfig({ onImportConfig, onImportPlatforms }: Options) {
  const [importNote, setImportNote] = useState<ImportNote | null>(null);

  const clearImportNote = useCallback(() => {
    setImportNote(null);
  }, []);

  const importFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      try {
        const data: unknown = JSON.parse(await file.text());
        const parsed = parseIconConfig(data);
        if (!parsed) throw new Error("not an icon config");
        onImportConfig(parsed);
        const ids = parsePlatformIds(data);
        if (ids) onImportPlatforms(ids);
        setImportNote(
          parsed.fgMode === "image" && !parsed.imageSrc
            ? {
                text: "config imported — re-upload the source image",
                error: false,
              }
            : null,
        );
      } catch {
        setImportNote({ text: "not a valid icon-config.json", error: true });
      }
    },
    [onImportConfig, onImportPlatforms],
  );

  return { clearImportNote, importFile, importNote };
}
