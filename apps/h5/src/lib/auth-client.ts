import { createWebAccountLinkClient, createWebAuthClient } from "@infra/sdk";

/** Base URL of the auth/todo/timeline API. Exported so other modules (e.g. the Google
 *  sign-in redirect on the auth page) build API URLs from one source. */
export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/**
 * Single shared auth client. h5 is a browser, so it uses the web cookie transport
 * (`platform: "web"`, `credentials: "include"`) — no token is ever stored client-side.
 */
export const authClient = createWebAuthClient(API_BASE);

/** Account-security client (cookie transport): identities / link phone / unlink. */
export const accountLinkClient = createWebAccountLinkClient(API_BASE);
