import { createWebAuthClient } from "@infra/sdk";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Single shared web auth client (cookie transport). Imported by the session provider and auth flow. */
export const authClient = createWebAuthClient(API_BASE);
