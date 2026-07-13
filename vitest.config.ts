import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@infra/sdk": r("./packages/sdk/src/index.ts"),
      "@infra/shared": r("./packages/shared/src/index.ts"),
      "@infra/design": r("./packages/design/src/index.ts"),
      "@infra/auth/testing": r("./packages/auth/src/testing.ts"),
      "@infra/auth": r("./packages/auth/src/index.ts"),
      "@infra/env/core": r("./packages/env/src/core.ts"),
      "@infra/env/bot": r("./packages/env/src/bot.ts"),
      "@infra/redis": r("./packages/redis/src/index.ts"),
      "@infra/db": r("./packages/db/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: [
      "packages/**/test/**/*.test.ts",
      "apps/**/test/**/*.test.ts",
      ".github/scripts/test/**/*.test.ts",
      "scripts/test/**/*.test.ts",
    ],
  },
});
