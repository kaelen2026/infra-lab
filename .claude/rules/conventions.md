# Conventions

- TypeScript ESM, `moduleResolution: "Bundler"`, `verbatimModuleSyntax` on (use `import type`).
- Biome formats & lints (2-space, double quotes, trailing commas, 100 cols). Pre-commit runs lint-staged;
  commit-msg enforces **Conventional Commits** (commitlint). Keep commit body lines ≤100 chars.
- `OTP_DEBUG_RETURN_CODE=true` returns the code in the request response — **dev only**; never in prod.
