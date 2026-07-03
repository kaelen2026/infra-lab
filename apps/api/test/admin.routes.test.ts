import { describe, expect, it } from "vitest";
import {
  type AdminRepository,
  type AdminUserRecord,
  createAdminRoutes,
} from "../src/routes/admin.routes.js";

// undici's Response.json() is typed as unknown; tests assert on dynamic shapes.
const readJson = (res: Response): Promise<any> => res.json() as Promise<any>;

// ── In-memory admin repository ────────────────────────────────────────────────────
class FakeAdminRepository implements AdminRepository {
  users: AdminUserRecord[] = [];
  todos = 0;
  posts = 0;
  logins: { at: Date; success: boolean }[] = [];

  async countUsers() {
    return this.users.length;
  }
  async listUsers(limit: number, offset: number): Promise<AdminUserRecord[]> {
    return [...this.users]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(offset, offset + limit);
  }
  async countTodos() {
    return this.todos;
  }
  async countTimelinePosts() {
    return this.posts;
  }
  async countLoginEventsSince(since: Date, success: boolean) {
    return this.logins.filter((l) => l.success === success && l.at >= since).length;
  }
}

// requireUser + isAdmin stubs, switchable per test.
function setup(opts?: { user?: { id: string; phone: string } | null; adminPhones?: string[] }) {
  const current = {
    user: opts?.user === undefined ? { id: "u1", phone: "+8613800138000" } : opts.user,
  };
  const adminPhones = new Set(opts?.adminPhones ?? ["+8613800138000"]);
  const admin = new FakeAdminRepository();
  const app = createAdminRoutes({
    admin,
    requireUser: async () => current.user,
    isAdmin: (u) => adminPhones.has(u.phone),
  });
  return { app, admin, current };
}

function get(app: ReturnType<typeof createAdminRoutes>, path: string) {
  return app.request(path, { method: "GET" });
}

describe("admin routes", () => {
  it("GET /admin/access returns isAdmin=true for an allowlisted user", async () => {
    const { app } = setup();
    const res = await get(app, "/admin/access");
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ ok: true, isAdmin: true });
  });

  it("GET /admin/access returns isAdmin=false for a plain user (not 403)", async () => {
    const { app } = setup({ user: { id: "u2", phone: "+8613900139000" } });
    const res = await get(app, "/admin/access");
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ ok: true, isAdmin: false });
  });

  it("GET /admin/access is 401 when unauthenticated", async () => {
    const { app } = setup({ user: null });
    const res = await get(app, "/admin/access");
    expect(res.status).toBe(401);
    expect((await readJson(res)).code).toBe("UNAUTHORIZED");
  });

  it("GET /admin/stats is 401 unauthenticated, 403 for a non-admin", async () => {
    const anon = setup({ user: null });
    expect((await get(anon.app, "/admin/stats")).status).toBe(401);

    const plain = setup({ user: { id: "u2", phone: "+8613900139000" } });
    const res = await get(plain.app, "/admin/stats");
    expect(res.status).toBe(403);
    expect((await readJson(res)).code).toBe("FORBIDDEN");
  });

  it("GET /admin/stats aggregates counts for an admin", async () => {
    const { app, admin } = setup();
    admin.users.push(
      { id: "a", phone: "+8613800138000", displayName: null, createdAt: new Date() },
      { id: "b", phone: "+8613900139000", displayName: "小明", createdAt: new Date() },
    );
    admin.todos = 5;
    admin.posts = 3;
    admin.logins.push(
      { at: new Date(), success: true },
      { at: new Date(), success: true },
      { at: new Date(), success: false },
    );

    const res = await get(app, "/admin/stats");
    expect(res.status).toBe(200);
    expect((await readJson(res)).stats).toEqual({
      totalUsers: 2,
      totalTodos: 5,
      totalTimelinePosts: 3,
      loginsLast7d: 2,
      failedLoginsLast7d: 1,
    });
  });

  it("GET /admin/users masks phones and never leaks the raw number", async () => {
    const { app, admin } = setup();
    admin.users.push({
      id: "a",
      phone: "+8613800138000",
      displayName: "管理员",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    const res = await get(app, "/admin/users");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.users[0].phoneMasked).toBe("+*********8000");
    expect(JSON.stringify(body)).not.toContain("13800138000");
    expect(body.nextOffset).toBeNull();
  });

  it("GET /admin/users paginates with limit and reports nextOffset", async () => {
    const { app, admin } = setup();
    for (let i = 0; i < 3; i++) {
      admin.users.push({
        id: `u${i}`,
        phone: `+861380013800${i}`,
        displayName: null,
        createdAt: new Date(2026, 0, i + 1),
      });
    }
    const res = await get(app, "/admin/users?limit=2&offset=0");
    const body = await readJson(res);
    expect(body.users).toHaveLength(2);
    expect(body.nextOffset).toBe(2);

    const res2 = await get(app, "/admin/users?limit=2&offset=2");
    const body2 = await readJson(res2);
    expect(body2.users).toHaveLength(1);
    expect(body2.nextOffset).toBeNull();
  });

  it("GET /admin/users rejects a malformed limit", async () => {
    const { app } = setup();
    const res = await get(app, "/admin/users?limit=0");
    expect(res.status).toBe(400);
    expect((await readJson(res)).code).toBe("INVALID_REQUEST");
  });
});
