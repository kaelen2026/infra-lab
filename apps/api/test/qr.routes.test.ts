import { QR_POLL_TOKEN_HEADER } from "@infra/shared";
import { describe, expect, it } from "vitest";
import type { UserRecord } from "../src/routes/auth.routes.js";
import {
  createQrRoutes,
  type QrRouteDeps,
  type QrTicketRecord,
  type QrTicketStore,
} from "../src/routes/qr.routes.js";

// undici's Response.json() is typed as unknown; tests assert on dynamic shapes.
const readJson = (res: Response): Promise<any> => res.json() as Promise<any>;

// ── In-memory QR ticket store (no TTL semantics needed for these tests) ──────────
class FakeQrTicketStore implements QrTicketStore {
  rows = new Map<string, QrTicketRecord>();
  async set(ticketId: string, record: QrTicketRecord): Promise<void> {
    this.rows.set(ticketId, { ...record });
  }
  async get(ticketId: string): Promise<QrTicketRecord | null> {
    const row = this.rows.get(ticketId);
    return row ? { ...row } : null;
  }
  async del(ticketId: string): Promise<void> {
    this.rows.delete(ticketId);
  }
}

const fakeUser: UserRecord = {
  id: "user_native",
  phone: "+8613800138000",
  email: null,
  displayName: "Scanner",
  avatarUrl: null,
  role: "user",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

function setup(overrides: Partial<QrRouteDeps> = {}) {
  const tickets = new FakeQrTicketStore();
  const current: { id: string | null } = { id: "user_native" };
  const known: { user: UserRecord | null } = { user: fakeUser };
  const deps: QrRouteDeps = {
    tickets,
    requireUser: async () => (current.id ? { id: current.id } : null),
    issueWebSessionForUser: async (userId) =>
      known.user && known.user.id === userId
        ? { user: known.user, cookies: [`infra.session=cookie_for_${userId}; Path=/; HttpOnly`] }
        : null,
    ...overrides,
  };
  return { app: createQrRoutes(deps), tickets, current, known };
}

function post(app: ReturnType<typeof createQrRoutes>, path: string, body?: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function createTicket(app: ReturnType<typeof createQrRoutes>) {
  const res = await post(app, "/auth/qr/create", {});
  const body = await readJson(res);
  return { ticketId: body.ticketId as string, pollToken: body.pollToken as string };
}

describe("qr routes — create", () => {
  it("issues a ticketId + pollToken and stores a pending ticket", async () => {
    const { app, tickets } = setup();
    const res = await post(app, "/auth/qr/create", {});
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.ok).toBe(true);
    expect(typeof body.ticketId).toBe("string");
    expect(typeof body.pollToken).toBe("string");
    expect(body.expiresIn).toBeGreaterThan(0);
    // The plaintext pollToken is never persisted — only its hash.
    const stored = tickets.rows.get(body.ticketId);
    expect(stored?.status).toBe("pending");
    expect(stored?.pollTokenHash).not.toBe(body.pollToken);
  });
});

describe("qr routes — status", () => {
  // Canonical form: the secret pollToken rides the x-qr-poll-token header, never
  // the query string (a GET query is recorded by proxies / browser history).
  const statusWithHeader = (
    app: ReturnType<typeof createQrRoutes>,
    ticketId: string,
    pollToken: string,
  ) =>
    app.request(`/auth/qr/status?${new URLSearchParams({ ticketId })}`, {
      headers: { [QR_POLL_TOKEN_HEADER]: pollToken },
    });

  it("reports pending, then approved after a native approve (header form)", async () => {
    const { app } = setup();
    const { ticketId, pollToken } = await createTicket(app);

    let res = await statusWithHeader(app, ticketId, pollToken);
    expect(await readJson(res)).toMatchObject({ status: "pending" });

    await post(app, "/auth/qr/approve", { ticketId });
    res = await statusWithHeader(app, ticketId, pollToken);
    expect(await readJson(res)).toMatchObject({ status: "approved" });
  });

  it("still accepts the deprecated pollToken query parameter (one deploy cycle)", async () => {
    const { app } = setup();
    const { ticketId, pollToken } = await createTicket(app);
    const q = new URLSearchParams({ ticketId, pollToken });
    const res = await app.request(`/auth/qr/status?${q}`);
    expect(await readJson(res)).toMatchObject({ status: "pending" });
  });

  it("prefers the header over the query when both are present", async () => {
    const { app } = setup();
    const { ticketId, pollToken } = await createTicket(app);
    // Correct header + garbage query: header must win, so the poll succeeds.
    const q = new URLSearchParams({ ticketId, pollToken: "wrong-token" });
    const res = await app.request(`/auth/qr/status?${q}`, {
      headers: { [QR_POLL_TOKEN_HEADER]: pollToken },
    });
    expect(await readJson(res)).toMatchObject({ status: "pending" });
  });

  it("collapses a wrong pollToken to expired (no ticket-existence leak)", async () => {
    const { app } = setup();
    const { ticketId } = await createTicket(app);
    const res = await statusWithHeader(app, ticketId, "wrong-token");
    expect(res.status).toBe(200);
    expect(await readJson(res)).toMatchObject({ status: "expired" });
  });

  it("reports expired for an unknown ticket", async () => {
    const { app } = setup();
    const q = new URLSearchParams({ ticketId: "nope", pollToken: "nope" });
    const res = await app.request(`/auth/qr/status?${q}`);
    expect(await readJson(res)).toMatchObject({ status: "expired" });
  });
});

describe("qr routes — approve", () => {
  it("rejects an unauthenticated caller with 401", async () => {
    const { app, current } = setup();
    current.id = null;
    const { ticketId } = await createTicket(app);
    const res = await post(app, "/auth/qr/approve", { ticketId });
    expect(res.status).toBe(401);
    expect((await readJson(res)).code).toBe("UNAUTHORIZED");
  });

  it("returns 404 QR_NOT_FOUND for an unknown ticket", async () => {
    const { app } = setup();
    const res = await post(app, "/auth/qr/approve", { ticketId: "missing" });
    expect(res.status).toBe(404);
    expect((await readJson(res)).code).toBe("QR_NOT_FOUND");
  });

  it("binds the approving user and rejects a second approve with 409", async () => {
    const { app, tickets } = setup();
    const { ticketId } = await createTicket(app);

    const ok = await post(app, "/auth/qr/approve", { ticketId });
    expect(ok.status).toBe(200);
    expect(tickets.rows.get(ticketId)?.userId).toBe("user_native");

    const again = await post(app, "/auth/qr/approve", { ticketId });
    expect(again.status).toBe(409);
    expect((await readJson(again)).code).toBe("QR_ALREADY_USED");
  });
});

describe("qr routes — consume", () => {
  it("issues a session cookie for the approved user, single-use", async () => {
    const { app } = setup();
    const { ticketId, pollToken } = await createTicket(app);
    await post(app, "/auth/qr/approve", { ticketId });

    const res = await post(app, "/auth/qr/consume", { ticketId, pollToken });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.user.id).toBe("user_native");
    expect(res.headers.get("set-cookie")).toContain("infra.session=");

    // Ticket is consumed — a replay can't mint a second session.
    const replay = await post(app, "/auth/qr/consume", { ticketId, pollToken });
    expect(replay.status).toBe(404);
    expect((await readJson(replay)).code).toBe("QR_NOT_FOUND");
  });

  it("rejects consume before approval with 409 QR_NOT_APPROVED", async () => {
    const { app } = setup();
    const { ticketId, pollToken } = await createTicket(app);
    const res = await post(app, "/auth/qr/consume", { ticketId, pollToken });
    expect(res.status).toBe(409);
    expect((await readJson(res)).code).toBe("QR_NOT_APPROVED");
  });

  it("rejects a wrong pollToken with 404 (secret proves browser ownership)", async () => {
    const { app } = setup();
    const { ticketId } = await createTicket(app);
    await post(app, "/auth/qr/approve", { ticketId });
    const res = await post(app, "/auth/qr/consume", { ticketId, pollToken: "attacker" });
    expect(res.status).toBe(404);
    expect((await readJson(res)).code).toBe("QR_NOT_FOUND");
  });

  it("returns 404 when the approved user vanished before consume", async () => {
    const { app, known } = setup();
    const { ticketId, pollToken } = await createTicket(app);
    await post(app, "/auth/qr/approve", { ticketId });
    known.user = null; // user deleted between approve and consume
    const res = await post(app, "/auth/qr/consume", { ticketId, pollToken });
    expect(res.status).toBe(404);
    expect((await readJson(res)).code).toBe("QR_NOT_FOUND");
  });
});
