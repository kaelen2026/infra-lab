import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { TokenStore } from "@infra/sdk";
import type { AuthTokens } from "@infra/shared";

/**
 * File-backed {@link TokenStore} for the terminal client. Mirrors the secure
 * stores the native SDKs use (Keychain / Keystore / HUKS) with the desktop
 * equivalent: a `0600` JSON file under the user's config dir. This is what lets a
 * `login` persist across process invocations — every later command loads it back.
 *
 * `load` is defensive: a missing, unreadable, or malformed file resolves to `null`
 * (treated as "logged out") rather than throwing.
 */
export function createFileTokenStore(path: string): TokenStore {
  return {
    async load(): Promise<AuthTokens | null> {
      try {
        const raw = await readFile(path, "utf8");
        const parsed = JSON.parse(raw) as Partial<AuthTokens>;
        if (
          typeof parsed.accessToken === "string" &&
          typeof parsed.refreshToken === "string" &&
          typeof parsed.tokenType === "string"
        ) {
          return parsed as AuthTokens;
        }
        return null;
      } catch {
        return null;
      }
    },

    async save(tokens: AuthTokens): Promise<void> {
      await mkdir(dirname(path), { recursive: true });
      // `mode` only applies on create; chmod covers the overwrite case so a
      // pre-existing file can never be left group/world-readable.
      await writeFile(path, `${JSON.stringify(tokens, null, 2)}\n`, { mode: 0o600 });
      await chmod(path, 0o600);
    },

    async clear(): Promise<void> {
      await rm(path, { force: true });
    },
  };
}
