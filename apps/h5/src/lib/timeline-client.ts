import { createWebTimelineClient } from "@infra/sdk";

/** API origin, also used to resolve relative `/uploads/...` image urls to absolute. */
export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

/**
 * Single shared timeline client (web cookie transport, same session as
 * `authClient`). The share landing only calls `getShared`, which hits a public
 * endpoint, so it works even for a signed-out visitor.
 */
export const timelineClient = createWebTimelineClient(API_BASE);

/** Resolve an API-relative image url (`/uploads/…`) to an absolute one. */
export function resolveImageUrl(url: string): string {
  return url.startsWith("/") ? `${API_BASE}${url}` : url;
}
