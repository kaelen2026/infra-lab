import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage/unit",
      include: [
        "src/lib/configStorage.ts",
        "src/lib/iconConfigSchema.ts",
        "src/lib/lucide.ts",
        "src/lib/presets.ts",
        "src/lib/renderVariants.ts",
        "src/lib/variations.ts",
        "src/modules/exporting/lib/exportPresets.ts",
        "src/modules/exporting/lib/exportZip.ts",
        "src/modules/exporting/lib/ico.ts",
        "src/modules/exporting/lib/readiness.ts",
        "src/modules/saved-designs/lib/savedDesigns.ts",
      ],
      exclude: ["src/**/*.test.{ts,tsx}"],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
    },
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
