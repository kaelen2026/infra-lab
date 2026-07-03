import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { hostname, type as osType, release } from "node:os";
import { dirname } from "node:path";
import type { DeviceInfo } from "@infra/shared";

/**
 * Load the stable per-install device id, creating (and persisting) one on first
 * use. Sent as `device.deviceId` at verify time so the account dashboard can list
 * this terminal like any other client install; kept stable so re-logins reuse the
 * same `device` row instead of spawning duplicates.
 */
export async function loadOrCreateDeviceId(path: string): Promise<string> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as { deviceId?: unknown };
    if (typeof parsed.deviceId === "string" && parsed.deviceId.length > 0) {
      return parsed.deviceId;
    }
  } catch {
    // No usable file yet — fall through and create one.
  }
  const deviceId = randomUUID();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ deviceId }, null, 2)}\n`, { mode: 0o600 });
  return deviceId;
}

/** Non-secret descriptive fields for the `device` row (all bounded by the contract). */
export function describeDevice(deviceId: string): DeviceInfo {
  return {
    platform: "cli",
    deviceId,
    model: hostname().slice(0, 128),
    osVersion: `${osType()} ${release()}`.slice(0, 64),
    appVersion: `infra-lab-cli/0.1.0`,
  };
}
