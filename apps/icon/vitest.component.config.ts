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
      reportsDirectory: "./coverage/components",
      include: [
        "src/components/**/*.{ts,tsx}",
        "src/modules/**/components/**/*.{ts,tsx}",
        "src/modules/**/hooks/**/*.{ts,tsx}",
      ],
      exclude: ["src/**/*.test.{ts,tsx}"],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
    environment: "happy-dom",
    include: ["src/components/**/*.test.tsx", "src/modules/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
