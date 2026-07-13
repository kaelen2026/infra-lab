import type { CliDeviceFlowService, OtpService } from "@infra/auth";
import type { Db } from "@infra/db";
import { parseCoreEnv } from "@infra/env/core";
import { describe, expect, it } from "vitest";
import { type AppDeps, createApp } from "../src/app.js";
import type { Logger } from "../src/observability/logger.js";
import type { AccountLinkService } from "../src/routes/account-link.routes.js";
import type { AdminRepository } from "../src/routes/admin.routes.js";
import type { SessionService, UserRepository } from "../src/routes/auth.routes.js";
import type { QrTicketStore } from "../src/routes/qr.routes.js";
import type { SocialAuthService } from "../src/routes/social.routes.js";
import type { ImageStore, TimelinePostRepository } from "../src/routes/timeline.routes.js";
import type { TodoRepository } from "../src/routes/todo.routes.js";

// App-level wiring tests: /ready draining and the /metrics scrape surface. Route
// behaviour has its own per-feature suites; the collaborators here are inert stubs
// that only need to satisfy construction (none of the business routes are invoked).

function noopLogger(): Logger {
  const logger: Logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    child: () => logger,
  };
  return logger;
}

function buildApp(overrides: Partial<AppDeps> = {}) {
  const env = parseCoreEnv({
    DATABASE_URL: "postgres://app:app@localhost:5432/app",
    REDIS_URL: "redis://localhost:6379",
    OTP_SECRET: "s".repeat(32),
    // Keep the transport rate limiter out of these tests (it has its own suite).
    RATE_LIMIT_MAX: "0",
  });
  const deps: AppDeps = {
    env,
    log: noopLogger(),
    db: { execute: async () => [{ one: 1 }] } as unknown as Db,
    redis: { ping: async () => "PONG" },
    otp: {} as OtpService,
    cliDeviceFlow: {} as CliDeviceFlowService,
    users: {} as UserRepository,
    todos: {} as TodoRepository,
    timeline: {} as TimelinePostRepository,
    admin: {} as AdminRepository,
    images: {} as ImageStore,
    sessions: { requireUser: async () => null } as unknown as SessionService,
    social: { isEnabled: () => false } as unknown as SocialAuthService,
    accountLink: { isEnabled: () => false } as unknown as AccountLinkService,
    qrTickets: {} as QrTicketStore,
    rateLimitStore: { incr: async () => 1, expire: async () => true },
    sms: async () => {},
    sendEmailOtp: async () => {},
    ...overrides,
  };
  return createApp(deps);
}

describe("createApp wiring", () => {
  it("does not mount Better Auth's parallel HTTP surface", async () => {
    const res = await buildApp().request("/api/auth/session");
    expect(res.status).toBe(404);
  });

  it("mounts ONLY the OAuth provider callback from Better Auth (not the rest of /api/auth)", async () => {
    let seenPath = "";
    const app = buildApp({
      oauthCallbackHandler: (req) => {
        seenPath = new URL(req.url).pathname;
        return new Response(null, { status: 200 });
      },
    });
    // The provider redirect lands on the callback → routed to Better Auth's handler.
    const cb = await app.request("/api/auth/callback/google");
    expect(cb.status).toBe(200);
    expect(seenPath).toBe("/api/auth/callback/google");
    // The rest of Better Auth's surface stays unmounted.
    expect((await app.request("/api/auth/session")).status).toBe(404);
    expect((await app.request("/api/auth/sign-in/social")).status).toBe(404);
  });

  it("does not mount the OAuth callback when no provider is configured", async () => {
    // Default deps omit oauthCallbackHandler → even the callback path 404s.
    expect((await buildApp().request("/api/auth/callback/google")).status).toBe(404);
  });

  it("/ready reports 200 with dependency checks when healthy", async () => {
    const res = await buildApp().request("/ready");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, checks: { db: { ok: true }, redis: { ok: true } } });
  });

  it("/ready flips to 503 draining while shutting down (without probing deps)", async () => {
    let draining = false;
    const app = buildApp({
      isShuttingDown: () => draining,
      // A probe during drain would hang on this db stub — proving /ready short-circuits.
      db: {
        execute: () => new Promise(() => {}),
      } as unknown as Db,
    });
    draining = true;
    const res = await app.request("/ready");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, draining: true });
  });

  it("collapses unmatched 404 paths into one bounded wildcard series", async () => {
    // Load-bearing cardinality invariant: metrics label with the matched route
    // pattern, so arbitrary unmatched URLs must all fold into a single wildcard
    // series — if a Hono upgrade ever changed routePath semantics for 404s to the
    // raw path, this is the test that catches the silent cardinality explosion.
    const app = buildApp();
    await app.request("/no-such-route");
    await app.request("/another/1f7d9a2e-63cd-4f4e-9f4e-2b8b6f0c9d11");
    const text = await (await app.request("/metrics")).text();
    const notFound = text
      .split("\n")
      .filter((l) => l.startsWith("http_requests_total") && l.includes('status="404"'));
    expect(notFound).toHaveLength(1);
    expect(notFound[0]).toContain('path="/*"');
    expect(notFound[0]).toContain("} 2");
    // The raw request URLs must never surface as label values.
    expect(text).not.toContain("no-such-route");
  });

  it("/metrics exposes request series labelled by matched route pattern", async () => {
    const app = buildApp();
    await app.request("/health");
    await app.request("/health");
    const res = await app.request("/metrics");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const text = await res.text();
    expect(text).toContain('http_requests_total{method="GET",path="/health",status="200"} 2');
    expect(text).toContain("http_request_duration_seconds_count");
    expect(text).toContain("http_requests_in_flight");
  });
});
