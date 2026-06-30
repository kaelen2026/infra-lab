// Minimal zero-dependency structured logger.
//
// Emits one JSON object per line (JSON-lines) so a container/platform log
// collector can parse it directly — no log shipper or external SDK to run.
// `info`/`warn` go to stdout, `error` to stderr.
//
// PII rule: callers must never pass phone numbers, OTP codes, tokens, or other
// secrets in `fields`. There is deliberately no body/credential logging here.

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** Returns a logger that merges `bindings` into every line (e.g. a requestId). */
  child(bindings: LogFields): Logger;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface LoggerOptions {
  /** Lines below this level are dropped. Defaults to LOG_LEVEL env or "info". */
  level?: LogLevel;
  /** Static fields merged into every line (e.g. service name). */
  base?: LogFields;
}

function isLevel(value: string | undefined): value is LogLevel {
  return value === "debug" || value === "info" || value === "warn" || value === "error";
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const envLevel = process.env.LOG_LEVEL;
  const minLevel: LogLevel = options.level ?? (isLevel(envLevel) ? envLevel : "info");
  const threshold = LEVEL_WEIGHT[minLevel];
  const base = options.base ?? {};

  function emit(level: LogLevel, msg: string, fields: LogFields = {}): void {
    if (LEVEL_WEIGHT[level] < threshold) return;
    const line = JSON.stringify({
      time: new Date().toISOString(),
      level,
      msg,
      ...base,
      ...fields,
    });
    if (level === "error") process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  }

  return {
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
    child: (bindings) => createLogger({ level: minLevel, base: { ...base, ...bindings } }),
  };
}
