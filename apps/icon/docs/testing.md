# Testing Pyramid

This project uses Vitest as the base test framework.

## Layers

- Unit tests: fast pure TypeScript checks for parsing, export helpers, presets,
  and renderer-adjacent data transforms. Current script scope: `src/lib`.
- Component tests: jsdom-like interaction checks for client components through
  Testing Library and `happy-dom`. Current script scope: `src/components`.
- E2E tests: Playwright browser flows for routing, canvas rendering, downloads,
  and mobile viewport usability. Current script scope: `e2e`.

## Commands

```sh
pnpm test            # all Vitest tests
pnpm test:unit       # pure unit layer
pnpm test:unit:coverage # unit layer with coverage thresholds
pnpm test:component  # component interaction layer
pnpm test:component:coverage # component layer coverage report
pnpm test:coverage   # unit + component coverage reports
pnpm test:e2e        # Playwright browser layer
pnpm test:watch      # local watch mode
```

Coverage uses Vitest's V8 provider and reports `text`, `html`, and `lcov`.
Unit reports are written to `coverage/unit/`; component reports are written to
`coverage/components/`. The unit layer enforces 70% for statements, branches,
functions, and lines. The component layer enforces 80% for statements, branches,
functions, and lines.

The release gate is:

```sh
pnpm test && pnpm lint && pnpm typecheck && pnpm build
```

The full local quality gate is:

```sh
pnpm quality
```

It runs coverage thresholds, repository hygiene checks, design constraints,
Markdown lint, secret scanning, ESLint, Biome, dead-code detection, typecheck,
and production build. See `docs/quality.md` for the full local quality tool
map.

Component coverage includes React components and colocated component hooks.
Unit coverage includes pure `src/lib` modules such as config parsing, export
registries, presets, and render variant data.

Run `pnpm test` before the release gate when changing app behavior. Run
`pnpm test:e2e` when changing routing, export/download behavior, canvas
rendering, or responsive layout. Run `pnpm test:e2e:prod` after `pnpm build`
before release or deploy. Run `pnpm audit:deps` before release and dependency
updates.
