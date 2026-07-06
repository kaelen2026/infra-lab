import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    // Workers-only Upstash REST adapter (subpath `@infra/redis/upstash`); kept out of
    // the default index so the Node build never bundles it next to ioredis.
    upstash: "src/upstash.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["@infra/auth", "ioredis", "@upstash/redis"],
});
