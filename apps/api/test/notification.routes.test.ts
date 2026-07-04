import type { Platform } from "@infra/shared";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createLogger } from "../src/observability/logger.js";
import { type ObsEnv, observability } from "../src/observability/middleware.js";
import type { PushTarget } from "../src/routes/auth.routes.js";
import {
  createNotificationRoutes,
  type PushTargetRepository,
} from "../src/routes/notification.routes.js";
import type { ApnsClient, ApnsPayload, ApnsSendResult } from "../src/services/apns-client.js";

const readJson = (res: Response): Promise<any> => res.json() as Promise<any>;

class FakePushRepo implements PushTargetRepository {
  tokens: PushTarget[] = [];
  cleared: string[] = [];
  async listPushTokens(_userId: string, _platform: Platform): Promise<PushTarget[]> {
    return this.tokens;
  }
  async clearPushToken(_userId: string, deviceId: string): Promise<void> {
    this.cleared.push(deviceId);
  }
}

// APNS stub whose per-token result is scripted by the test; records each payload.
function fakeApns(results: Record<string, ApnsSendResult>, sent: ApnsPayload[]): ApnsClient {
  return {
    async send(deviceToken, payload) {
      sent.push(payload);
      return results[deviceToken] ?? { ok: true };
    },
  };
}

function setup(opts: {
  tokens?: PushTarget[];
  results?: Record<string, ApnsSendResult>;
  userId?: string | null;
}) {
  const push = new FakePushRepo();
  push.tokens = opts.tokens ?? [];
  const current: { id: string | null } = { id: opts.userId === undefined ? "user_a" : opts.userId };
  const sent: ApnsPayload[] = [];
  const routes = createNotificationRoutes({
    apns: fakeApns(opts.results ?? {}, sent),
    push,
    requireUser: async () => (current.id ? { id: current.id } : null),
  });
  // Mount behind the observability middleware, exactly as server.ts does, so the
  // handler's `c.get("log")` is populated.
  const app = new Hono<ObsEnv>();
  app.use("*", observability(createLogger({ level: "error" })));
  app.route("/", routes);
  return { app, push, current, sent };
}

function post(app: Hono<ObsEnv>, body?: unknown) {
  return app.request("/notifications/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("POST /notifications/test", () => {
  it("401s when unauthenticated", async () => {
    const { app } = setup({ userId: null });
    const res = await post(app);
    expect(res.status).toBe(401);
    expect((await readJson(res)).code).toBe("UNAUTHORIZED");
  });

  it("sends to every registered iOS token and reports the count", async () => {
    const { app } = setup({
      tokens: [
        { deviceId: "d1", pushToken: "t1" },
        { deviceId: "d2", pushToken: "t2" },
      ],
    });
    const res = await post(app, { title: "Ping", body: "Pong" });
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ ok: true, devices: 2, sent: 2, cleared: 0 });
  });

  it("clears a token APNS reports as unregistered, keeping the good ones", async () => {
    const { app, push } = setup({
      tokens: [
        { deviceId: "live", pushToken: "good" },
        { deviceId: "dead", pushToken: "bad" },
      ],
      results: {
        good: { ok: true },
        bad: { ok: false, status: 410, reason: "Unregistered", unregistered: true },
      },
    });
    const res = await post(app);
    expect(await readJson(res)).toEqual({ ok: true, devices: 2, sent: 1, cleared: 1 });
    expect(push.cleared).toEqual(["dead"]);
  });

  it("passes an optional deep link through as the custom `link` data key", async () => {
    const { app, sent } = setup({ tokens: [{ deviceId: "d1", pushToken: "t1" }] });
    const res = await post(app, { title: "Ping", body: "Pong", link: "infralab://timeline/p1" });
    expect(res.status).toBe(200);
    expect(sent).toEqual([
      { title: "Ping", body: "Pong", data: { link: "infralab://timeline/p1" } },
    ]);
  });

  it("omits the data key entirely when no link is provided", async () => {
    const { app, sent } = setup({ tokens: [{ deviceId: "d1", pushToken: "t1" }] });
    await post(app, { title: "Ping", body: "Pong" });
    expect(sent).toEqual([{ title: "Ping", body: "Pong" }]);
  });

  it("does not clear a token on a transient failure", async () => {
    const { app, push } = setup({
      tokens: [{ deviceId: "d1", pushToken: "t1" }],
      results: { t1: { ok: false, status: 503, unregistered: false } },
    });
    const res = await post(app);
    expect(await readJson(res)).toEqual({ ok: true, devices: 1, sent: 0, cleared: 0 });
    expect(push.cleared).toEqual([]);
  });
});
