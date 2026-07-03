import type { Platform } from "@infra/sdk";

const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYY-MM-DD HH:mm` in local time, stable width for mono columns. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `YYYY-MM-DD` in local time. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Feed-style relative time: recency in plain words while it matters, calendar
 * date once it doesn't. Keeps the timestamp out of the content's way.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const diffMs = now.getTime() - d.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24 && d.getDate() === now.getDate()) return `${hours} 小时前`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString())
    return `昨天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

const PLATFORM_LABELS: Record<Platform, string> = {
  web: "Web",
  ios: "iOS",
  android: "Android",
  harmony: "HarmonyOS",
};

export function platformLabel(platform: Platform): string {
  return PLATFORM_LABELS[platform];
}
