import {
  createWebAccountLinkClient,
  createWebAuthClient,
  createWebQrLoginClient,
} from "@infra/sdk";

import { env } from "./env";

/** Single shared web auth client (cookie transport). Imported by the session provider and auth flow. */
export const authClient = createWebAuthClient(env.apiBaseUrl);

/** QR cross-device login client (cookie transport): create → poll status → consume. */
export const qrLoginClient = createWebQrLoginClient(env.apiBaseUrl);

/** Account-security client (cookie transport): identities / link phone / unlink. */
export const accountLinkClient = createWebAccountLinkClient(env.apiBaseUrl);
