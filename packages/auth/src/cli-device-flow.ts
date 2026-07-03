import { createHmac, randomBytes, randomInt } from "node:crypto";
import type { DeviceInfo } from "@infra/shared";
import type { OtpStore } from "./otp.js";

/**
 * CLI browser-assisted login — the OAuth Device Authorization Grant (RFC 8628),
 * as GitHub CLI does it. The terminal client can't read the browser cookie jar, so
 * instead it requests a `deviceCode` (secret, held only by the CLI) plus a short
 * `userCode` (shown to the user), the user approves in the browser reusing their
 * existing web session, and the CLI polls until it receives its own tokens.
 *
 * State lives in the same `OtpStore` KV port the OTP service uses (Redis in prod,
 * `FakeRedis` in tests). The `deviceCode` is stored only as an HMAC hash — a Redis
 * leak never exposes a live, poll-ready secret — mirroring how OTP codes are kept.
 */

const PREFIX = "cli";

/** Redis keys this service touches — exported so tests/ops can introspect them. */
export const CLI_DEVICE_KEYS = {
  /** Keyed by the HMAC hash of the deviceCode (the CLI's secret). */
  code: (hash: string) => `${PREFIX}:dc:${hash}`,
  /** Maps a normalized userCode → the deviceCode hash, for the approve lookup. */
  user: (normalizedUserCode: string) => `${PREFIX}:uc:${normalizedUserCode}`,
} as const;

// Unambiguous alphabet: no vowels (avoids real words), no 0/O/1/I look-alikes.
const USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ23456789";
const USER_CODE_GROUP = 4; // XXXX-XXXX

export interface CliDeviceFlowConfig {
  store: OtpStore;
  /** HMAC secret — the deviceCode is hashed with this before being written to Redis. */
  secret: string;
  /** Injectable clock (epoch ms) for deterministic tests. Defaults to Date.now. */
  now?: () => number;
  /** Seconds until the codes expire (default 900 = 15 min). */
  expiresInSeconds?: number;
  /** Minimum seconds the CLI must wait between token polls (default 5). */
  intervalSeconds?: number;
}

export interface CliDeviceStartResult {
  deviceCode: string;
  userCode: string;
  expiresIn: number;
  interval: number;
}

export type CliDeviceApproveResult = "approved" | "denied" | "not_found";

export type CliDevicePollResult =
  | { status: "approved"; userId: string; device: DeviceInfo }
  | { status: "authorization_pending" }
  | { status: "slow_down" }
  | { status: "expired_token" }
  | { status: "access_denied" };

export interface CliDeviceFlowService {
  requestCode(input: {
    deviceId: string;
    model?: string;
    osVersion?: string;
    appVersion?: string;
  }): Promise<CliDeviceStartResult>;
  /** Approve (or deny) a pending request on behalf of an authenticated user. */
  approve(
    userCode: string,
    userId: string,
    opts?: { deny?: boolean },
  ): Promise<CliDeviceApproveResult>;
  /** Poll for the outcome; a successful (approved) poll consumes the code. */
  poll(deviceCode: string): Promise<CliDevicePollResult>;
}

interface DeviceFlowRecord {
  userCode: string;
  deviceId: string;
  model?: string;
  osVersion?: string;
  appVersion?: string;
  approvedUserId?: string;
  denied?: boolean;
  lastPolledMs?: number;
}

function hashDeviceCode(secret: string, deviceCode: string): string {
  return createHmac("sha256", secret).update(deviceCode).digest("hex");
}

/** Canonical userCode key: uppercase, alphanumerics only (hyphen/case/space tolerant). */
function normalizeUserCode(userCode: string): string {
  return userCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function generateUserCode(): string {
  const chars: string[] = [];
  for (let i = 0; i < USER_CODE_GROUP * 2; i++) {
    chars.push(USER_CODE_ALPHABET[randomInt(0, USER_CODE_ALPHABET.length)] ?? "X");
  }
  return `${chars.slice(0, USER_CODE_GROUP).join("")}-${chars.slice(USER_CODE_GROUP).join("")}`;
}

export function createCliDeviceFlowService(config: CliDeviceFlowConfig): CliDeviceFlowService {
  const { store, secret } = config;
  const now = config.now ?? Date.now;
  const expiresIn = config.expiresInSeconds ?? 900;
  const interval = config.intervalSeconds ?? 5;

  /** Re-persist a record under its remaining TTL (never resurrect an expired one). */
  async function saveRecord(hash: string, record: DeviceFlowRecord): Promise<void> {
    const ttl = await store.ttl(CLI_DEVICE_KEYS.code(hash));
    if (ttl <= 0) return; // expired/absent — don't recreate it
    await store.set(CLI_DEVICE_KEYS.code(hash), JSON.stringify(record), { ttlSeconds: ttl });
  }

  async function loadRecord(hash: string): Promise<DeviceFlowRecord | null> {
    const raw = await store.get(CLI_DEVICE_KEYS.code(hash));
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as DeviceFlowRecord;
    } catch {
      return null;
    }
  }

  return {
    async requestCode(input): Promise<CliDeviceStartResult> {
      const deviceCode = randomBytes(20).toString("hex");
      const hash = hashDeviceCode(secret, deviceCode);

      // Claim a unique userCode with SET NX; regenerate on the (rare) collision.
      let userCode = generateUserCode();
      for (let attempt = 0; attempt < 5; attempt++) {
        const claimed = await store.set(CLI_DEVICE_KEYS.user(normalizeUserCode(userCode)), hash, {
          ttlSeconds: expiresIn,
          ifNotExists: true,
        });
        if (claimed) break;
        userCode = generateUserCode();
      }

      const record: DeviceFlowRecord = {
        userCode,
        deviceId: input.deviceId,
        model: input.model,
        osVersion: input.osVersion,
        appVersion: input.appVersion,
      };
      await store.set(CLI_DEVICE_KEYS.code(hash), JSON.stringify(record), {
        ttlSeconds: expiresIn,
      });

      return { deviceCode, userCode, expiresIn, interval };
    },

    async approve(userCode, userId, opts = {}): Promise<CliDeviceApproveResult> {
      const hash = await store.get(CLI_DEVICE_KEYS.user(normalizeUserCode(userCode)));
      if (hash === null) return "not_found";
      const record = await loadRecord(hash);
      if (!record) return "not_found";
      // First decision wins: don't flip an already-approved request to denied or vice versa.
      if (record.approvedUserId || record.denied) {
        return record.denied ? "denied" : "approved";
      }
      if (opts.deny) record.denied = true;
      else record.approvedUserId = userId;
      await saveRecord(hash, record);
      return opts.deny ? "denied" : "approved";
    },

    async poll(deviceCode): Promise<CliDevicePollResult> {
      const hash = hashDeviceCode(secret, deviceCode);
      const record = await loadRecord(hash);
      if (!record) return { status: "expired_token" };

      if (record.denied) {
        await store.del(
          CLI_DEVICE_KEYS.code(hash),
          CLI_DEVICE_KEYS.user(normalizeUserCode(record.userCode)),
        );
        return { status: "access_denied" };
      }

      if (record.approvedUserId) {
        // Consume on success so a second poll can't re-issue tokens.
        await store.del(
          CLI_DEVICE_KEYS.code(hash),
          CLI_DEVICE_KEYS.user(normalizeUserCode(record.userCode)),
        );
        return {
          status: "approved",
          userId: record.approvedUserId,
          device: {
            platform: "cli",
            deviceId: record.deviceId,
            model: record.model,
            osVersion: record.osVersion,
            appVersion: record.appVersion,
          },
        };
      }

      // Still pending — enforce the poll interval (RFC 8628 slow_down).
      const ms = now();
      if (record.lastPolledMs !== undefined && ms - record.lastPolledMs < interval * 1000) {
        return { status: "slow_down" };
      }
      record.lastPolledMs = ms;
      await saveRecord(hash, record);
      return { status: "authorization_pending" };
    },
  };
}
