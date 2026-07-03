/**
 * Minimal client-side structured logger — the single seam for web telemetry.
 *
 * Today it writes leveled JSON to the browser console; it exists so error
 * boundaries, the global 401 handler and future features report through ONE place
 * that a real sink (Sentry, an ingest endpoint) can later be wired behind without
 * touching call sites. `debug`/`info` are silenced in production to keep the console
 * clean; `warn`/`error` always emit.
 *
 * NEVER pass a phone number, OTP code, session cookie or token in `context` — the
 * same rule the API logs live under. Callers log stable codes and safe metadata only.
 */

type Level = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, string | number | boolean | null | undefined>;

const isProd = process.env.NODE_ENV === "production";

function emit(level: Level, message: string, context?: LogContext): void {
  if (isProd && (level === "debug" || level === "info")) return;
  const line = { level, message, ...context };
  // Route through the matching console method so browser devtools filter by level.
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit("debug", message, context),
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, context?: LogContext) => emit("error", message, context),
} as const;
