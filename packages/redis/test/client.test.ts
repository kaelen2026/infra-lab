import { describe, expect, it, vi } from "vitest";
import { createRedis } from "../src/client.js";

// Hermetic: lazyConnect keeps ioredis from dialing anything; the `error` event is
// emitted by hand. What's under test is the wiring, not the transport.
describe("createRedis", () => {
  it("routes client-level error events into onError instead of crashing", () => {
    const onError = vi.fn();
    const redis = createRedis("redis://localhost:6379", { lazyConnect: true, onError });

    const boom = new Error("connect ECONNREFUSED 127.0.0.1:6379");
    // With no `error` listener registered this emit would throw (EventEmitter
    // semantics) — the process-crash mode the listener exists to prevent.
    expect(() => redis.emit("error", boom)).not.toThrow();
    expect(onError).toHaveBeenCalledWith(boom);
    redis.disconnect();
  });

  it("registers a fallback error listener when no onError is given", () => {
    const redis = createRedis("redis://localhost:6379", { lazyConnect: true });
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      expect(redis.listenerCount("error")).toBeGreaterThan(0);
      expect(() => redis.emit("error", new Error("boom"))).not.toThrow();
      // The fallback logs the message only — never a key/value payload echo.
      expect(write).toHaveBeenCalledWith(expect.stringContaining("redis client error"));
    } finally {
      write.mockRestore();
      redis.disconnect();
    }
  });
});
