import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { createLogger } from "../src/observability/logger.js";
import type { ObsEnv } from "../src/observability/middleware.js";
import { createRateLimiter, type RateLimitStore } from "../src/rate-limit.js";

// undici's Response.json() is typed as unknown; tests assert on dynamic shapes.
const readJson = (res: Response): Promise<any> => res.json() as Promise<any>;

// In-memory counter fake. Keys embed the window, so advancing the clock naturally
// rotates to a fresh counter — no TTL bookkeeping needed in the fake.
class FakeStore implements RateLimitStore {
  readonly counts = new Map<string, number>();
  incr(key: string): Promise<number> {
    const next = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, next);
    return Promise.resolve(next);
  }
  expire(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

// Store whose incr always fails, to exercise the fail-open path.
const throwingStore: RateLimitStore = {
  incr: () => Promise.reject(new Error("redis down")),
  expire: () => Promise.resolve(true),
};

// The limiter reads a request-scoped logger off the context; suppress it at "error".
const quietLog = createLogger({ level: "error" });

function setup(opts: {
  store: RateLimitStore;
  max: number;
  windowSeconds: number;
  now: () => number;
}) {
  const app = new Hono<ObsEnv>();
  app.use("*", (c, next) => {
    c.set("log", quietLog);
    return next();
  });
  app.use(
    "*",
    createRateLimiter({
      store: opts.store,
      max: opts.max,
      windowSeconds: opts.windowSeconds,
      now: opts.now,
      // Bucket per test-supplied client id so cases can vary the "IP".
      clientId: (c) => c.req.header("x-test-ip") ?? "ip-1",
    }),
  );
  app.get("/", (c) => c.json({ ok: true }));
  return app;
}

const hit = (app: Hono<ObsEnv>, ip = "ip-1") => app.request("/", { headers: { "x-test-ip": ip } });

describe("createRateLimiter", () => {
  let nowMs: number;
  const now = () => nowMs;

  beforeEach(() => {
    // 1_000_000 ms → 1000 s → window floor(1000/60) = 16, which ends at 1020 s.
    nowMs = 1_000_000;
  });

  it("allows requests up to the limit, then rejects with 429", async () => {
    const app = setup({ store: new FakeStore(), max: 3, windowSeconds: 60, now });
    for (let i = 0; i < 3; i++) {
      expect((await hit(app)).status).toBe(200);
    }
    expect((await hit(app)).status).toBe(429);
  });

  it("returns the standard { ok, code } envelope and a Retry-After header on 429", async () => {
    const app = setup({ store: new FakeStore(), max: 1, windowSeconds: 60, now });
    expect((await hit(app)).status).toBe(200);

    const res = await hit(app);
    expect(res.status).toBe(429);
    const json = await readJson(res);
    expect(json).toEqual({ ok: false, code: "RATE_LIMITED" });
    // Window ends at 1020 s; current time is 1000 s → back off ~20 s.
    expect(res.headers.get("retry-after")).toBe("20");
  });

  it("resets the count once the window rolls over", async () => {
    const app = setup({ store: new FakeStore(), max: 1, windowSeconds: 60, now });
    expect((await hit(app)).status).toBe(200);
    expect((await hit(app)).status).toBe(429);

    // Advance past the window boundary (1020 s) into the next window.
    nowMs = 1_020_000;
    expect((await hit(app)).status).toBe(200);
  });

  it("buckets independently per client id", async () => {
    const app = setup({ store: new FakeStore(), max: 1, windowSeconds: 60, now });
    expect((await hit(app, "ip-a")).status).toBe(200);
    // Same window, different client → its own counter, still allowed.
    expect((await hit(app, "ip-b")).status).toBe(200);
    // ip-a is now over its own limit.
    expect((await hit(app, "ip-a")).status).toBe(429);
  });

  it("fails open when the store errors (request passes through)", async () => {
    const app = setup({ store: throwingStore, max: 1, windowSeconds: 60, now });
    expect((await hit(app)).status).toBe(200);
    // Even a second call still passes — the limiter never blocks when it can't count.
    expect((await hit(app)).status).toBe(200);
  });
});
