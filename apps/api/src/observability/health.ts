import type { Db } from "@infra/db";
import { sql } from "drizzle-orm";

// Structural type so this module needn't depend on ioredis directly.
export interface Pingable {
  ping(): Promise<string>;
}

export interface ReadinessDeps {
  db: Db;
  redis: Pingable;
  /** Per-dependency probe timeout. Keeps the readiness endpoint from hanging. */
  timeoutMs?: number;
}

export interface CheckResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface ReadinessReport {
  ok: boolean;
  checks: Record<"db" | "redis", CheckResult>;
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms).unref(),
  );
}

async function probe(ms: number, fn: () => Promise<unknown>): Promise<CheckResult> {
  const startedAt = Date.now();
  try {
    await Promise.race([fn(), timeout(ms)]);
    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Actively probes Postgres (`select 1`) and Redis (`PING`) so an external
 * uptime check can tell whether the service can actually serve, not just that
 * the process is alive.
 */
export async function checkReadiness(deps: ReadinessDeps): Promise<ReadinessReport> {
  const ms = deps.timeoutMs ?? 2000;
  const [db, redis] = await Promise.all([
    probe(ms, () => deps.db.execute(sql`select 1`)),
    probe(ms, () => deps.redis.ping()),
  ]);
  return { ok: db.ok && redis.ok, checks: { db, redis } };
}
