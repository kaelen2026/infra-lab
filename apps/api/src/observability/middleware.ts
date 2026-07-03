import { randomUUID } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import type { Logger } from "./logger.js";

// Context variables published by the observability middleware. The top-level
// app is typed with this so handlers / onError can read the per-request logger.
export interface ObsVariables {
  requestId: string;
  log: Logger;
}

export type ObsEnv = { Variables: ObsVariables };

const REQUEST_ID_HEADER = "x-request-id";
// Accept an inbound id (set by an upstream proxy / client) so a single request
// can be correlated end-to-end, but bound its length to avoid log injection.
const MAX_INBOUND_ID = 128;

function inboundRequestId(c: Context): string {
  const header = c.req.header(REQUEST_ID_HEADER)?.trim();
  if (header && header.length <= MAX_INBOUND_ID) return header;
  return randomUUID();
}

function clientIp(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return c.req.header("x-real-ip") ?? "0.0.0.0";
}

export interface ObservabilityOptions {
  /**
   * A successful request (status < 400) slower than this many ms is logged at
   * `warn` with `slow: true` instead of `info`, so latency regressions surface in
   * the access log without a metrics backend. 0 (default) disables the escalation.
   */
  slowRequestMs?: number;
}

/**
 * Assigns a request id, exposes a request-scoped child logger on the context,
 * echoes the id in the `x-request-id` response header, and logs one structured
 * line per request (method, path, status, latency, ip).
 *
 * Never logs request bodies, phone numbers, OTP codes, or tokens.
 */
export function observability(
  logger: Logger,
  options: ObservabilityOptions = {},
): MiddlewareHandler<ObsEnv> {
  const slowRequestMs = options.slowRequestMs ?? 0;
  return async (c, next) => {
    const requestId = inboundRequestId(c);
    const log = logger.child({ requestId });
    c.set("requestId", requestId);
    c.set("log", log);
    // Set before next() so the id is present even on error/aborted responses.
    c.header(REQUEST_ID_HEADER, requestId);

    const startedAt = Date.now();
    const { method } = c.req;
    const path = new URL(c.req.url).pathname;

    try {
      await next();
    } finally {
      const durationMs = Date.now() - startedAt;
      const status = c.res.status;
      const slow = slowRequestMs > 0 && durationMs >= slowRequestMs;
      const fields = { method, path, status, durationMs, ip: clientIp(c), ...(slow && { slow }) };
      if (status >= 500) log.error("request failed", fields);
      else if (status >= 400) log.warn("request rejected", fields);
      else if (slow) log.warn("slow request", fields);
      else log.info("request", fields);
    }
  };
}
