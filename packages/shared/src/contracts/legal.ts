/**
 * Legal documents contract — the隐私协议 (privacy policy) and 用户服务协议 (user
 * service agreement).
 *
 * **h5 HOSTS the rendered pages; every other client REFERENCES them by the SAME
 * path/URL built here**, so the routes never drift across clients (this mirrors
 * `timelineSharePath` / `timelineAppLink`). This contract deliberately carries
 * only the identifiers + url builders — the prose itself lives in `@infra/design`
 * (`LEGAL_DOCS`), an h5/web-only surface that is NOT emitted to the native clients
 * (same rule as `COPY.timelineShare`). TS clients (h5 / web) render that content
 * directly; native clients (ios / android / harmony) can't import TS, so they open
 * the h5-hosted url via {@link legalUrl}.
 */

/** The two legal documents, in display order. Source of the `LegalDocKind` union. */
export const LEGAL_DOC_KINDS = ["privacy", "terms"] as const;
export type LegalDocKind = (typeof LEGAL_DOC_KINDS)[number];

/**
 * Client-side route each document is rendered at. Shared so h5 (React Router) and
 * web (Next.js file routing) mount the exact same paths and every link resolves.
 */
export const LEGAL_ROUTES = {
  privacy: "/legal/privacy",
  terms: "/legal/terms",
} as const satisfies Record<LegalDocKind, string>;

/** The app-local path for a document (e.g. `/legal/privacy`). */
export function legalPath(kind: LegalDocKind): string {
  return LEGAL_ROUTES[kind];
}

/**
 * The absolute url a client opens to REFERENCE the h5-hosted page — e.g.
 * `legalUrl("https://app.example.com", "privacy")` → `https://app.example.com/legal/privacy`.
 * `baseUrl` is the h5 deployment origin (trailing slashes are trimmed). The native
 * clients pass their configured h5 base url; web can either render {@link LEGAL_DOCS}
 * itself or link out with this.
 */
export function legalUrl(baseUrl: string, kind: LegalDocKind): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}${LEGAL_ROUTES[kind]}`;
}
