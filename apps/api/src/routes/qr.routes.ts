import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  type AuthErrorCode,
  approveQrLoginSchema,
  consumeQrLoginSchema,
  QR_LOGIN_LIMITS,
  QR_POLL_TOKEN_HEADER,
  type QrLoginStatus,
  qrLoginStatusQuerySchema,
} from "@infra/shared";
import { type Context, Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ObsEnv } from "../observability/middleware.js";
import { toAuthUser, type UserRecord } from "./auth.routes.js";

// ── Ports the routes depend on (implemented in src/services with Redis) ──────────
/**
 * A short-lived QR login ticket. `pollTokenHash` is the sha256 of the secret the
 * creating browser keeps — approve never needs it, so only the browser (holding the
 * plaintext token) can read status or consume the ticket.
 */
export interface QrTicketRecord {
  status: "pending" | "approved";
  pollTokenHash: string;
  /** The approving user's id — null until a native client approves. */
  userId: string | null;
}

/** Minimal TTL-KV port for QR tickets — backed by Redis, faked in tests. */
export interface QrTicketStore {
  set(ticketId: string, record: QrTicketRecord, ttlSeconds: number): Promise<void>;
  get(ticketId: string): Promise<QrTicketRecord | null>;
  del(ticketId: string): Promise<void>;
}

export interface QrRouteDeps {
  tickets: QrTicketStore;
  /** Resolve the approving native user from Cookie or Bearer (null when unauthenticated). */
  requireUser: (headers: Headers) => Promise<{ id: string } | null>;
  /** Issue a browser session cookie for an approved user id (null if the user vanished). */
  issueWebSessionForUser: (
    userId: string,
  ) => Promise<{ user: UserRecord; cookies: string[] } | null>;
}

type QrErrorCode = Extract<
  AuthErrorCode,
  "INVALID_REQUEST" | "UNAUTHORIZED" | "QR_NOT_FOUND" | "QR_ALREADY_USED" | "QR_NOT_APPROVED"
>;

const ERROR_STATUS: Record<QrErrorCode, ContentfulStatusCode> = {
  INVALID_REQUEST: 400,
  UNAUTHORIZED: 401,
  QR_NOT_FOUND: 404,
  QR_ALREADY_USED: 409,
  QR_NOT_APPROVED: 409,
};

const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function verifyPollToken(ticket: QrTicketRecord, presented: string): boolean {
  return safeEqualHex(ticket.pollTokenHash, hashToken(presented));
}

export function createQrRoutes(deps: QrRouteDeps): Hono<ObsEnv> {
  const { tickets, requireUser, issueWebSessionForUser } = deps;
  const app = new Hono<ObsEnv>();

  const fail = (c: Context, code: QrErrorCode, extra: Record<string, unknown> = {}) =>
    c.json({ ok: false, code, ...extra }, ERROR_STATUS[code]);

  async function readJson(c: Context): Promise<unknown> {
    try {
      return await c.req.json();
    } catch {
      return undefined;
    }
  }

  // ── Browser: start a login ticket (anonymous) ────────────────────────────────
  app.post("/auth/qr/create", async (c) => {
    const ticketId = randomUUID();
    const pollToken = randomBytes(32).toString("base64url");
    await tickets.set(
      ticketId,
      { status: "pending", pollTokenHash: hashToken(pollToken), userId: null },
      QR_LOGIN_LIMITS.ttlSeconds,
    );
    return c.json({ ok: true, ticketId, pollToken, expiresIn: QR_LOGIN_LIMITS.ttlSeconds });
  });

  // ── Browser: poll ticket status (proves ownership with pollToken) ────────────
  app.get("/auth/qr/status", async (c) => {
    const parsed = qrLoginStatusQuerySchema.safeParse({
      ticketId: c.req.query("ticketId"),
      // The capability token travels in a header: a GET query string gets recorded
      // by upstream proxies / browser history / Referer. The query form is kept as
      // a deprecated fallback for one deploy cycle — an already-open login tab
      // polls with the previous bundle until refreshed (issue #129 L1).
      pollToken: c.req.header(QR_POLL_TOKEN_HEADER) ?? c.req.query("pollToken"),
    });
    if (!parsed.success) return fail(c, "INVALID_REQUEST", { issues: parsed.error.issues });

    const ticket = await tickets.get(parsed.data.ticketId);
    // Missing / consumed / wrong token all collapse to `expired`: the browser restarts,
    // and we never reveal whether a given ticket id exists (or its approval state) to a
    // caller that can't present the secret pollToken.
    const status: QrLoginStatus =
      ticket && verifyPollToken(ticket, parsed.data.pollToken) ? ticket.status : "expired";
    return c.json({ ok: true, status });
  });

  // ── Native: approve a scanned ticket (Cookie or Bearer) ──────────────────────
  app.post("/auth/qr/approve", async (c) => {
    const user = await requireUser(c.req.raw.headers);
    if (!user) return fail(c, "UNAUTHORIZED");

    const parsed = approveQrLoginSchema.safeParse(await readJson(c));
    if (!parsed.success) return fail(c, "INVALID_REQUEST", { issues: parsed.error.issues });

    const ticket = await tickets.get(parsed.data.ticketId);
    if (!ticket) return fail(c, "QR_NOT_FOUND");
    // Only a pending ticket can be approved — reject re-approval / a ticket already
    // approved by someone else so a second scan can't hijack the browser session.
    if (ticket.status !== "pending") return fail(c, "QR_ALREADY_USED");

    // Preserve pollTokenHash (approve never learns the secret) and grant the browser a
    // fresh window to consume the now-approved ticket.
    await tickets.set(
      parsed.data.ticketId,
      { ...ticket, status: "approved", userId: user.id },
      QR_LOGIN_LIMITS.approvalWindowSeconds,
    );
    return c.json({ ok: true });
  });

  // ── Browser: exchange an approved ticket for a session cookie ────────────────
  app.post("/auth/qr/consume", async (c) => {
    const parsed = consumeQrLoginSchema.safeParse(await readJson(c));
    if (!parsed.success) return fail(c, "INVALID_REQUEST", { issues: parsed.error.issues });

    const ticket = await tickets.get(parsed.data.ticketId);
    if (!ticket || !verifyPollToken(ticket, parsed.data.pollToken)) return fail(c, "QR_NOT_FOUND");
    if (ticket.status !== "approved" || !ticket.userId) return fail(c, "QR_NOT_APPROVED");

    // Single-use: delete before issuing so a replayed consume can't mint a second
    // session from the same ticket.
    await tickets.del(parsed.data.ticketId);

    const issued = await issueWebSessionForUser(ticket.userId);
    // The approving user was deleted between approve and consume — treat as gone.
    if (!issued) return fail(c, "QR_NOT_FOUND");
    for (const cookie of issued.cookies) c.header("set-cookie", cookie, { append: true });
    return c.json({ ok: true, user: toAuthUser(issued.user, false) });
  });

  return app;
}
