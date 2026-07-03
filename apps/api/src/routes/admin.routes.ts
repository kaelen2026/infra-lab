import {
  type AdminErrorCode,
  type AdminStatsDTO,
  type AdminUserDTO,
  listAdminUsersSchema,
  maskPhone,
} from "@infra/shared";
import { type Context, Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

// ── Ports the routes depend on (implemented in src/services with db) ─────────────
/** A user as the admin console sees them; `phone` is masked before it leaves here. */
export interface AdminUserRecord {
  id: string;
  phone: string | null;
  displayName: string | null;
  createdAt: Date;
}

/**
 * Read-only aggregate access for the admin console. No method takes a `userId`:
 * these are cross-user aggregates, only ever reached after the `isAdmin` gate.
 */
export interface AdminRepository {
  countUsers(): Promise<number>;
  /** Newest-first page of users. Fetches `limit + 1` internally is the caller's job. */
  listUsers(limit: number, offset: number): Promise<AdminUserRecord[]>;
  countTodos(): Promise<number>;
  countTimelinePosts(): Promise<number>;
  /** Count `login_event` rows since `since` with the given success flag. */
  countLoginEventsSince(since: Date, success: boolean): Promise<number>;
}

/** The subset of the resolved user the admin gate needs (id for logs, phone to match). */
export interface AdminSessionUser {
  id: string;
  phone: string;
}

export interface AdminRouteDeps {
  admin: AdminRepository;
  /** Resolve the current user from Cookie or Bearer (null when unauthenticated). */
  requireUser: (headers: Headers) => Promise<AdminSessionUser | null>;
  /** Whether a resolved user is an admin (built from the ADMIN_PHONES allowlist). */
  isAdmin: (user: AdminSessionUser) => boolean;
}

const ERROR_STATUS: Record<AdminErrorCode, ContentfulStatusCode> = {
  INVALID_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toAdminUserDTO(record: AdminUserRecord): AdminUserDTO {
  return {
    id: record.id,
    // Never ship the raw number — even to an admin.
    phoneMasked: maskPhone(record.phone ?? ""),
    displayName: record.displayName,
    createdAt: record.createdAt.toISOString(),
  };
}

export function createAdminRoutes(deps: AdminRouteDeps): Hono {
  const { admin, requireUser, isAdmin } = deps;
  const app = new Hono();

  const fail = (c: Context, code: AdminErrorCode, extra: Record<string, unknown> = {}) =>
    c.json({ ok: false, code, ...extra }, ERROR_STATUS[code]);

  /**
   * Resolve the current user and require admin membership. Returns the user on
   * success, or a ready-to-return failure Response (401 unauthenticated, 403
   * non-admin) the handler forwards. Callers branch with `instanceof Response`.
   */
  async function requireAdmin(c: Context): Promise<AdminSessionUser | Response> {
    const user = await requireUser(c.req.raw.headers);
    if (!user) return fail(c, "UNAUTHORIZED");
    if (!isAdmin(user)) return fail(c, "FORBIDDEN");
    return user;
  }

  // ── Whether the current user is an admin (any authenticated user may ask) ───────
  // Drives the web nav entry + client-side page guard; a plain user gets
  // `{ isAdmin: false }` (200), not a 403, so the check is a normal branch.
  app.get("/admin/access", async (c) => {
    const user = await requireUser(c.req.raw.headers);
    if (!user) return fail(c, "UNAUTHORIZED");
    return c.json({ ok: true, isAdmin: isAdmin(user) });
  });

  // ── Aggregate stats (admin only) ────────────────────────────────────────────────
  app.get("/admin/stats", async (c) => {
    const gate = await requireAdmin(c);
    if (gate instanceof Response) return gate;

    const since = new Date(Date.now() - 7 * DAY_MS);
    const [totalUsers, totalTodos, totalTimelinePosts, loginsLast7d, failedLoginsLast7d] =
      await Promise.all([
        admin.countUsers(),
        admin.countTodos(),
        admin.countTimelinePosts(),
        admin.countLoginEventsSince(since, true),
        admin.countLoginEventsSince(since, false),
      ]);

    const stats: AdminStatsDTO = {
      totalUsers,
      totalTodos,
      totalTimelinePosts,
      loginsLast7d,
      failedLoginsLast7d,
    };
    return c.json({ ok: true, stats });
  });

  // ── Paginated user list (admin only) ──────────────────────────────────────────────
  app.get("/admin/users", async (c) => {
    const gate = await requireAdmin(c);
    if (gate instanceof Response) return gate;

    const parsed = listAdminUsersSchema.safeParse({
      limit: c.req.query("limit"),
      offset: c.req.query("offset"),
    });
    if (!parsed.success) return fail(c, "INVALID_REQUEST", { issues: parsed.error.issues });
    const { limit, offset } = parsed.data;

    // Fetch one extra to know whether another page exists without a second count query.
    const rows = await admin.listUsers(limit + 1, offset);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return c.json({
      ok: true,
      users: page.map(toAdminUserDTO),
      nextOffset: hasMore ? offset + limit : null,
    });
  });

  return app;
}
