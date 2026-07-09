// Apply the versioned migrations in ./migrations under a Postgres advisory lock.
//
// Replaces `drizzle-kit migrate` for the apply step (generate/push stay on drizzle-kit):
// the drizzle-kit PG migrator takes no lock, so two operators — or a CI deploy racing a
// manual run — could interleave DDL. `pg_advisory_lock` serialises appliers cluster-wide;
// the second one blocks until the first finishes, then finds the journal up to date and
// applies nothing. Same journal table as drizzle-kit (drizzle.__drizzle_migrations), so
// existing databases continue seamlessly.
//
// Usage (unchanged): DATABASE_URL=... pnpm --filter @infra/db migrate
// Falls back to the repo root .env, then to the docker-compose dev database.
// Never logs the DSN.

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const scriptsDir = dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  const rootEnvFile = resolve(scriptsDir, "../../../.env");
  if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile);
}
const url = process.env.DATABASE_URL ?? "postgres://app:app@localhost:5432/app";

// max: 1 is load-bearing — advisory locks are session-scoped, so the lock and the
// migration statements must run on the same connection.
const sql = postgres(url, {
  max: 1,
  connect_timeout: 10,
  // The migrator's journal bootstrap uses IF NOT EXISTS; those "already exists,
  // skipping" notices (42P06 duplicate_schema / 42P07 duplicate_table) fire on every
  // run and are noise. Anything else a migration raises still gets printed.
  onnotice: (notice) => {
    if (notice.code !== "42P06" && notice.code !== "42P07") console.log(notice.message);
  },
});

try {
  console.log("migrate: acquiring advisory lock (waits if another migrate is running)…");
  await sql`select pg_advisory_lock(hashtext('infra-lab:migrations'))`;
  await migrate(drizzle(sql), { migrationsFolder: resolve(scriptsDir, "../migrations") });
  console.log("migrate: journal up to date");
} finally {
  // Closing the session releases the advisory lock.
  await sql.end();
}
