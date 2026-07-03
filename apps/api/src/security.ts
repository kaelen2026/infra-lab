// Runtime security hardening applied to every request, independent of any route.
//
// Two concerns live here:
//  1. Baseline security response headers (MIME-sniffing, clickjacking, referrer
//     leakage, transport downgrade).
//  2. A global request-body ceiling, so a single request cannot force the process
//     to buffer an unbounded amount of memory (a cheap DoS otherwise).
//
// Both are pure factories returning hono middleware, so they can be unit-tested by
// mounting them on a throwaway app without booting the server (see test/security.test.ts).

import type { Context, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";

/**
 * Baseline security response headers for every response. Uses hono's defaults
 * (X-Content-Type-Options: nosniff, X-Frame-Options, Referrer-Policy,
 * Strict-Transport-Security, …) with one deliberate deviation:
 *
 * - `Cross-Origin-Resource-Policy: cross-origin` — timeline images are served from
 *   `GET /uploads/:name` and loaded via `<img>` by the web (:3000) and h5 (:3002)
 *   browser clients, which are different origins from the API. hono's default of
 *   `same-origin` would make browsers block those loads. The images are already
 *   unguessable-UUID public reads by design (see timeline.routes.ts), so
 *   cross-origin embedding is intended, not a leak.
 *
 * Strict-Transport-Security is emitted unconditionally; it is inert over plain HTTP
 * (browsers ignore HSTS on non-TLS responses) and correct once the API is fronted
 * by TLS in production.
 */
export function securityHeaders(): MiddlewareHandler {
  return secureHeaders({ crossOriginResourcePolicy: "cross-origin" });
}

// A body over the limit is rejected in the same `{ ok, code }` envelope the rest of
// the API uses, so clients get a uniform error shape (not hono's default text 413).
function payloadTooLarge(c: Context): Response {
  return c.json({ ok: false, code: "PAYLOAD_TOO_LARGE" }, 413);
}

/**
 * Global request-body ceiling. Rejects a body larger than `maxBytes` with a 413
 * before the handler runs, bounding the memory a single request can force the
 * process to buffer.
 *
 * NOTE: this is a global limit, so it must stay above the largest legitimate body —
 * currently a timeline image upload (TIMELINE_IMAGE_MAX_BYTES = 8 MiB) plus its
 * multipart framing overhead. The default (MAX_REQUEST_BODY_BYTES, 10 MiB) keeps
 * headroom for that; the per-route image check still enforces the exact image limit.
 */
export function requestBodyLimit(maxBytes: number): MiddlewareHandler {
  return bodyLimit({ maxSize: maxBytes, onError: payloadTooLarge });
}
