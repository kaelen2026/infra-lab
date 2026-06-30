import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema/auth.js";

export type Schema = typeof schema;

/** Create a Drizzle client backed by postgres-js from DATABASE_URL. */
export function createDb(url: string) {
  const client = postgres(url, { max: 10 });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
