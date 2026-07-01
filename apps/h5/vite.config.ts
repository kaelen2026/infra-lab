import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// h5 resolves the workspace packages to source (like apps/web and vitest) so Vite
// bundles their TS directly — no prebuilt `dist` is needed for local HMR. Production
// `pnpm build` still builds every package topologically.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": r("./src"),
      "@infra/sdk": r("../../packages/sdk/src/index.ts"),
      "@infra/shared": r("../../packages/shared/src/index.ts"),
      "@infra/design": r("../../packages/design/src/index.ts"),
    },
  },
  server: { port: 3002 },
});
