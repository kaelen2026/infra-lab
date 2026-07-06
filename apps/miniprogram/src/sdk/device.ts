import type { DeviceInfo } from "@infra/shared";

const DEVICE_ID_KEY = "infra.deviceId";

/**
 * A stable per-install id. The mini-program has no hardware UUID, so we mint one
 * on first run and persist it in storage; every later verify reuses it, letting the
 * server keep a single `device` row per install (see login-events / devices).
 */
function stableDeviceId(): string {
  const existing = wx.getStorageSync(DEVICE_ID_KEY) as string | "" | null;
  if (typeof existing === "string" && existing.length > 0) return existing;
  const id = `wx-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  wx.setStorageSync(DEVICE_ID_KEY, id);
  return id;
}

/** Device metadata sent at verify time, from the WeChat runtime. */
export function deviceInfo(): DeviceInfo {
  const sys = wx.getDeviceInfo();
  const app = wx.getAppBaseInfo();
  return {
    platform: "weapp",
    deviceId: stableDeviceId(),
    model: sys.model,
    osVersion: `${sys.system}`,
    appVersion: app.version ?? app.SDKVersion,
  };
}
