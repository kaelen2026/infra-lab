import { describe, expect, it } from "vitest";
import { createCliDeviceFlowService } from "../src/cli-device-flow.js";
import { FakeRedis } from "../src/testing.js";

function setup() {
  const store = new FakeRedis();
  const svc = createCliDeviceFlowService({
    store,
    secret: "device-flow-test-secret",
    now: store.now,
    intervalSeconds: 5,
    expiresInSeconds: 900,
  });
  return { store, svc };
}

describe("createCliDeviceFlowService", () => {
  it("stays pending until approved, then yields the user + device exactly once", async () => {
    const { store, svc } = setup();
    const { deviceCode, userCode } = await svc.requestCode({ deviceId: "d1", model: "mbp" });

    expect(await svc.poll(deviceCode)).toEqual({ status: "authorization_pending" });

    expect(await svc.approve(userCode, "user_1")).toBe("approved");

    store.advance(5); // clear the poll interval
    const approved = await svc.poll(deviceCode);
    expect(approved.status).toBe("approved");
    if (approved.status === "approved") {
      expect(approved.userId).toBe("user_1");
      expect(approved.device).toMatchObject({ platform: "cli", deviceId: "d1", model: "mbp" });
    }

    // Consumed on success — a second poll finds nothing.
    expect(await svc.poll(deviceCode)).toEqual({ status: "expired_token" });
  });

  it("normalizes the user code (case / hyphen / space tolerant)", async () => {
    const { store, svc } = setup();
    const { deviceCode, userCode } = await svc.requestCode({ deviceId: "d1" });
    const messy = `  ${userCode.toLowerCase().replace("-", "  ")} `;
    expect(await svc.approve(messy, "user_2")).toBe("approved");
    store.advance(5);
    expect((await svc.poll(deviceCode)).status).toBe("approved");
  });

  it("returns slow_down when polled faster than the interval", async () => {
    const { store, svc } = setup();
    const { deviceCode } = await svc.requestCode({ deviceId: "d1" });
    expect((await svc.poll(deviceCode)).status).toBe("authorization_pending");
    expect((await svc.poll(deviceCode)).status).toBe("slow_down");
    store.advance(5);
    expect((await svc.poll(deviceCode)).status).toBe("authorization_pending");
  });

  it("expires after the TTL", async () => {
    const { store, svc } = setup();
    const { deviceCode } = await svc.requestCode({ deviceId: "d1" });
    store.advance(901);
    expect(await svc.poll(deviceCode)).toEqual({ status: "expired_token" });
  });

  it("deny yields access_denied then consumes the code", async () => {
    const { svc } = setup();
    const { deviceCode, userCode } = await svc.requestCode({ deviceId: "d1" });
    expect(await svc.approve(userCode, "user_1", { deny: true })).toBe("denied");
    expect(await svc.poll(deviceCode)).toEqual({ status: "access_denied" });
    expect(await svc.poll(deviceCode)).toEqual({ status: "expired_token" });
  });

  it("approving an unknown user code is not_found", async () => {
    const { svc } = setup();
    expect(await svc.approve("ZZZZ-ZZZZ", "user_1")).toBe("not_found");
  });
});
