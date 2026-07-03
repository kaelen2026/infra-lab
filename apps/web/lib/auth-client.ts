import { createWebAuthClient } from "@infra/sdk";

import { env } from "./env";

/** Single shared web auth client (cookie transport). Imported by the session provider and auth flow. */
export const authClient = createWebAuthClient(env.apiBaseUrl);
