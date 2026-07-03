import { createWebTimelineClient } from "@infra/sdk";

import { env } from "./env";

/** Single shared web timeline client (cookie transport). */
export const timelineClient = createWebTimelineClient(env.apiBaseUrl);

/**
 * Resolve a relative image url the API issued (e.g. `/uploads/<name>.jpg`) into an
 * absolute one against the API base, so a plain `<img>` can load it. Absolute urls
 * (or anything unexpected) are returned unchanged.
 */
export function resolveImageUrl(url: string): string {
  return url.startsWith("/") ? `${env.apiBaseUrl}${url}` : url;
}
