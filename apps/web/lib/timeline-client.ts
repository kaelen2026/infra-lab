import { createWebTimelineClient } from "@infra/sdk";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Single shared web timeline client (cookie transport). */
export const timelineClient = createWebTimelineClient(API_BASE);

/**
 * Resolve a relative image url the API issued (e.g. `/uploads/<name>.jpg`) into an
 * absolute one against the API base, so a plain `<img>` can load it. Absolute urls
 * (or anything unexpected) are returned unchanged.
 */
export function resolveImageUrl(url: string): string {
  return url.startsWith("/") ? `${API_BASE}${url}` : url;
}
