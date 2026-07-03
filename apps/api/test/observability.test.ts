import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { LogFields, Logger } from "../src/observability/logger.js";
import { type ObsEnv, observability } from "../src/observability/middleware.js";

interface Line {
  level: string;
  msg: string;
  fields?: LogFields;
}

// A logger that records every line (including on child loggers, which share the sink)
// so the access-log level/shape can be asserted without parsing stdout.
function captureLogger(): { logger: Logger; lines: Line[] } {
  const lines: Line[] = [];
  const make = (): Logger => ({
    debug: (msg, fields) => lines.push({ level: "debug", msg, fields }),
    info: (msg, fields) => lines.push({ level: "info", msg, fields }),
    warn: (msg, fields) => lines.push({ level: "warn", msg, fields }),
    error: (msg, fields) => lines.push({ level: "error", msg, fields }),
    child: () => make(),
  });
  return { logger: make(), lines };
}

function appWith(logger: Logger, slowRequestMs?: number) {
  const app = new Hono<ObsEnv>();
  app.use("*", observability(logger, slowRequestMs === undefined ? {} : { slowRequestMs }));
  app.get("/fast", (c) => c.json({ ok: true }));
  app.get("/slow", async (c) => {
    await new Promise((r) => setTimeout(r, 15));
    return c.json({ ok: true });
  });
  return app;
}

describe("observability access log", () => {
  it("echoes a request id and logs one info line for a normal request", async () => {
    const { logger, lines } = captureLogger();
    const res = await appWith(logger, 0).request("/fast");
    expect(res.headers.get("x-request-id")).toBeTruthy();
    const access = lines.filter((l) => l.msg === "request");
    expect(access).toHaveLength(1);
    expect(access[0]?.level).toBe("info");
    expect(access[0]?.fields).toMatchObject({ method: "GET", path: "/fast", status: 200 });
  });

  it("escalates a request slower than slowRequestMs to a warn with slow: true", async () => {
    const { logger, lines } = captureLogger();
    await appWith(logger, 1).request("/slow");
    const slow = lines.find((l) => l.msg === "slow request");
    expect(slow?.level).toBe("warn");
    expect(slow?.fields).toMatchObject({ path: "/slow", status: 200, slow: true });
    expect(lines.some((l) => l.msg === "request")).toBe(false);
  });

  it("does not escalate when the slow threshold is 0 (disabled)", async () => {
    const { logger, lines } = captureLogger();
    await appWith(logger, 0).request("/slow");
    expect(lines.some((l) => l.msg === "slow request")).toBe(false);
    const access = lines.find((l) => l.msg === "request");
    expect(access?.level).toBe("info");
    expect(access?.fields).not.toHaveProperty("slow");
  });
});
