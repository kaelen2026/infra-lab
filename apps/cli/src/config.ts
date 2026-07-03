import { homedir } from "node:os";
import { join } from "node:path";

/** API base URL used when `INFRA_LAB_API_URL` is unset (the local dev API). */
export const DEFAULT_API_URL = "http://localhost:3001";

/** Environment bag, injectable so the resolution logic stays unit-testable. */
export type Env = Record<string, string | undefined>;

/** Resolve the API base URL, honoring `INFRA_LAB_API_URL` and stripping trailing slashes. */
export function resolveApiUrl(env: Env = process.env): string {
  const raw = env.INFRA_LAB_API_URL?.trim();
  const base = raw && raw.length > 0 ? raw : DEFAULT_API_URL;
  return base.replace(/\/+$/, "");
}

/**
 * Per-user config directory: `$XDG_CONFIG_HOME/infra-lab` when set, else
 * `~/.config/infra-lab`. Holds the credentials and device-id files.
 */
export function configDir(env: Env = process.env): string {
  const xdg = env.XDG_CONFIG_HOME?.trim();
  const base = xdg && xdg.length > 0 ? xdg : join(homedir(), ".config");
  return join(base, "infra-lab");
}

/** Path to the persisted session (Bearer + refresh tokens), mode 0600. */
export function credentialsPath(env: Env = process.env): string {
  return join(configDir(env), "credentials.json");
}

/** Path to the stable per-install device id sent with each login. */
export function deviceIdPath(env: Env = process.env): string {
  return join(configDir(env), "device.json");
}
