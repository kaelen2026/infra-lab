// Promote a user to the `admin` role (grants the web management console at /admin).
// The DB `user.role` column is the single source of truth for admin access; this is
// the out-of-band bootstrap for the first admin. Requires a built @infra/db:
//
//   pnpm build                       # or: pnpm --filter @infra/db build
//   node scripts/grant-admin.mjs +8613800138000
//   node scripts/grant-admin.mjs +8613800138000 --revoke   # demote back to `user`
//
// DATABASE_URL is read from the environment (repo .env is loaded if present).
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createDb } from "../packages/db/dist/index.js";

const [, , phoneArg, ...rest] = process.argv;
const revoke = rest.includes("--revoke");

if (!phoneArg) {
  console.error("usage: node scripts/grant-admin.mjs <phone> [--revoke]");
  process.exit(1);
}

// Load the repo .env (same lookup as @infra/env/core) so DATABASE_URL is available
// when run locally; in a deployed environment the platform injects it directly.
for (const candidate of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")]) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (put it in .env or the environment)");
  process.exit(1);
}

const db = createDb(url);
// The underlying postgres-js tagged-template client; parameterizes the phone safely.
const sql = db.$client;
const nextRole = revoke ? "user" : "admin";

try {
  const rows = await sql`
    UPDATE "user" SET role = ${nextRole}, updated_at = now() WHERE phone = ${phoneArg}
    RETURNING id
  `;
  if (rows.length === 0) {
    console.error(`no user found with phone ${phoneArg} (they must have logged in once)`);
    process.exitCode = 2;
  } else {
    console.log(`✅ set role='${nextRole}' for user ${rows[0].id} (phone ${phoneArg})`);
  }
} finally {
  await sql.end();
}
