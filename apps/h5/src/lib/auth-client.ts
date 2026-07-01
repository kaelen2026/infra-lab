import { createWebAuthClient } from "@infra/sdk";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/**
 * Single shared auth client. h5 is a browser, so it uses the web cookie transport
 * (`platform: "web"`, `credentials: "include"`) — no token is ever stored client-side.
 */
export const authClient = createWebAuthClient(API_BASE);
