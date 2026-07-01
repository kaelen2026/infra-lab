/**
 * `@infra/design` — the single source of truth for cross-client design.
 *
 * TS consumers (the web app) import tokens and copy directly from here. Native
 * clients (ios / android / harmony) can't import TS, so they consume GENERATED
 * files emitted by `generate.ts` from these exact same values. CI regenerates and
 * fails on any drift, so no client can hand-pick its own brand color or wording.
 */

export * from "./copy";
export * from "./tokens";
