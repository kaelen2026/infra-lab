import type { Platform } from "@infra/shared";
import { type Context, Hono } from "hono";
import type { ObsEnv } from "../observability/middleware.js";
import type { ApnsClient } from "../services/apns-client.js";
import type { PushTarget } from "./auth.routes.js";

/**
 * Notification routes. Currently a single **dev-only** self-push used to exercise the
 * full APNS path end-to-end (token lookup → send → dead-token cleanup) without a real
 * business trigger, which is not yet defined. Mounted by server.ts only when APNS is
 * configured AND the dev flag is on, so it is never exposed in production.
 */

// The device-repository slice this route needs (implemented by the user repository).
export interface PushTargetRepository {
  listPushTokens(userId: string, platform: Platform): Promise<PushTarget[]>;
  clearPushToken(userId: string, deviceId: string): Promise<void>;
}

export interface NotificationRouteDeps {
  apns: ApnsClient;
  push: PushTargetRepository;
  /** Resolve the current user from Cookie or Bearer (null when unauthenticated). */
  requireUser: (headers: Headers) => Promise<{ id: string } | null>;
}

/** Read an optional string field, trimmed and length-capped, falling back to a default. */
function field(raw: unknown, key: string, fallback: string, max: number): string {
  const value = (raw as Record<string, unknown>)?.[key];
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, max);
}

export function createNotificationRoutes(deps: NotificationRouteDeps): Hono<ObsEnv> {
  const { apns, push, requireUser } = deps;
  const app = new Hono<ObsEnv>();

  async function readJson(c: Context): Promise<unknown> {
    try {
      return await c.req.json();
    } catch {
      return undefined;
    }
  }

  // ── Dev-only: push a test notification to the caller's own iOS devices ────────
  app.post("/notifications/test", async (c) => {
    const user = await requireUser(c.req.raw.headers);
    if (!user) return c.json({ ok: false, code: "UNAUTHORIZED" }, 401);

    const raw = await readJson(c);
    // Optional deep link the app opens on tap (e.g. `infralab://timeline/<id>`),
    // delivered as the custom `link` key alongside `aps` (see `ApnsPayload.data`).
    const link = field(raw, "link", "", 512);
    const payload = {
      title: field(raw, "title", "Test", 128),
      body: field(raw, "body", "Hello from infra-lab 👋", 512),
      ...(link ? { data: { link } } : {}),
    };

    const targets = await push.listPushTokens(user.id, "ios");
    let sent = 0;
    let cleared = 0;
    for (const target of targets) {
      const res = await apns.send(target.pushToken, payload);
      if (res.ok) {
        sent += 1;
      } else if (res.unregistered) {
        // APNS says the token is dead — drop it so we stop pushing to a dead install.
        await push.clearPushToken(user.id, target.deviceId);
        cleared += 1;
        c.get("log").info("cleared unregistered push token", { status: res.status });
      } else {
        c.get("log").warn("apns send failed", { status: res.status, reason: res.reason });
      }
    }
    return c.json({ ok: true, devices: targets.length, sent, cleared });
  });

  return app;
}
