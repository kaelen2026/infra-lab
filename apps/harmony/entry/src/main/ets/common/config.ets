import { deviceInfo } from "@kit.BasicServicesKit";
import { preferences } from "@kit.ArkData";
import { util } from "@kit.ArkTS";
import { common } from "@kit.AbilityKit";
import { DeviceInfo } from "./contracts";

/**
 * API base URL. The host runs on :3001 (see `pnpm --filter @infra/api dev`).
 *  - Emulator → host loopback is `10.0.2.2`.
 *  - Physical device → use the dev machine's LAN IP (e.g. http://192.168.x.x:3001).
 * Cleartext HTTP is fine for local dev; ship HTTPS and a release base URL for prod.
 */
export const API_BASE_URL: string = "http://10.0.2.2:3001";

export const APP_VERSION: string = "1.0.0";

const PREFS_STORE: string = "infra_auth";
const DEVICE_ID_KEY: string = "device.id";

/**
 * Build the {@link DeviceInfo} sent on verify. The deviceId is generated once and
 * persisted, so the server's `device` table sees a stable per-install identity.
 */
export async function getDeviceInfo(context: common.Context): Promise<DeviceInfo> {
  const store: preferences.Preferences = await preferences.getPreferences(context, PREFS_STORE);
  let id: string = (await store.get(DEVICE_ID_KEY, "")) as string;
  if (id.length === 0) {
    id = util.generateRandomUUID(true);
    await store.put(DEVICE_ID_KEY, id);
    await store.flush();
  }
  const info: DeviceInfo = {
    platform: "harmony",
    deviceId: id,
    model: deviceInfo.productModel,
    osVersion: deviceInfo.osFullName,
    appVersion: APP_VERSION,
  };
  return info;
}
