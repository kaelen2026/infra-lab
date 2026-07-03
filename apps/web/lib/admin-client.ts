import { createWebAdminClient } from "@infra/sdk";

import { env } from "./env";

/** Single shared web admin client (cookie transport; the /admin/* routes are web-only). */
export const adminClient = createWebAdminClient(env.apiBaseUrl);
