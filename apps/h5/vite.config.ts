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
  // host: true binds all interfaces so a phone on the same Wi-Fi can open the dev
  // server (share landing /t/:id, legal pages) at http://<mac-lan-ip>:3002. Pair it
  // with VITE_API_URL=http://<mac-lan-ip>:3001 (apps/h5/.env.local) and the API's
  // TRUSTED_ORIGINS allowlist so cross-origin calls aren't blocked.
  server: { host: true, port: 3002 },
});
