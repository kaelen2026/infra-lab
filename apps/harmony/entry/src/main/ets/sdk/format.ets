import { Platform } from "../common/contracts";

/**
 * Date/label formatting for the account dashboard, mirroring `apps/h5`'s
 * `lib/format.ts` so every client renders timestamps and platform names identically.
 */

function pad(n: number): string {
  return `${n}`.padStart(2, "0");
}

/** `YYYY-MM-DD HH:mm` in local time, stable width for mono columns. */
export function formatDateTime(iso: string): string {
  const d: Date = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `YYYY-MM-DD` in local time. */
export function formatDate(iso: string): string {
  const d: Date = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Human label for a platform (mirrors h5's PLATFORM_LABELS). */
export function platformLabel(platform: Platform): string {
  switch (platform) {
    case "web":
      return "Web";
    case "ios":
      return "iOS";
    case "android":
      return "Android";
    case "harmony":
      return "HarmonyOS";
    default:
      return platform;
  }
}
