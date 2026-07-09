import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema/index.js";

export type Schema = typeof schema;

export interface CreateDbOptions {
  /**
   * Pool ceiling **per process**: N API replicas hold up to `N × max` connections,
   * so size it against the database's connection limit (see DATABASE_POOL_MAX in
   * @infra/env and docs/deployment.md).
   */
  max?: number;
  /** Seconds to wait for a new connection before failing (surfaces a dead endpoint early). */
  connectTimeoutSeconds?: number;
  /** Seconds an idle pooled connection lives before being closed (frees server slots). */
  idleTimeoutSeconds?: number;
}

/** Create a Drizzle client backed by postgres-js from DATABASE_URL. */
export function createDb(url: string, options: CreateDbOptions = {}) {
  const client = postgres(url, {
    max: options.max ?? 10,
    // Fail fast on an unreachable/hung endpoint instead of the driver's 30s default;
    // close idle connections so a quiet replica doesn't pin server-side slots open.
    connect_timeout: options.connectTimeoutSeconds ?? 10,
    idle_timeout: options.idleTimeoutSeconds ?? 300,
  });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
