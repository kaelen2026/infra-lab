// Cloudflare Workers Postgres adapter: Neon over the serverless driver.
//
// Kept in its own module (subpath `@infra/db/neon`) so it — and its
// `@neondatabase/serverless` dependency — is only pulled into the Workers bundle,
// never into the Node build, which uses the postgres-js `createDb` in `client.ts`.
//
// Uses the WebSocket `Pool` transport (not `neon-http`) because it must support the
// interactive transaction in `/auth/otp/verify` (find-or-create user + profile),
// which the HTTP driver cannot do. On Workers the global `WebSocket` backs the pool.

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "../schema/index.js";
import type { Db } from "./client.js";

// Re-export the schema namespace so the Workers composition root can pass it to
// Better Auth without importing `client.ts` (which would drag in postgres-js).
export { schema };

/**
 * Create a Drizzle client backed by Neon's serverless `Pool` from DATABASE_URL.
 *
 * The driver-specific Drizzle generic differs from postgres-js (`$client`, the query
 * result HKT), but the query-builder / transaction / `execute` surface every
 * repository and Better Auth consume is identical at runtime. The adapter absorbs
 * that difference with one localized cast so `Db` stays a single canonical type.
 */
export function createNeonDb(url: string): Db {
  const pool = new Pool({ connectionString: url });
  return drizzle(pool, { schema }) as unknown as Db;
}
