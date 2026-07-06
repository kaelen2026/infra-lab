import type { TokenStore } from "@infra/sdk";
import type { AuthTokens } from "@infra/shared";

const KEY = "infra.tokens";

/**
 * wx-storage-backed {@link TokenStore}, the mini-program analogue of the native
 * secure stores (Keychain / Keystore / HUKS) and the CLI's `0600` file store.
 *
 * Security note: wx storage is per-mini-program sandboxed but NOT hardware-encrypted,
 * so this does not match the native stores' guarantees. Short-lived access tokens +
 * rotating refresh tokens keep the exposure window small. Never log token payloads.
 */
export const wxTokenStore: TokenStore = {
  load(): AuthTokens | null {
    const raw = wx.getStorageSync(KEY) as Partial<AuthTokens> | "" | null;
    if (
      raw &&
      typeof raw.accessToken === "string" &&
      typeof raw.refreshToken === "string" &&
      typeof raw.tokenType === "string"
    ) {
      return raw as AuthTokens;
    }
    return null;
  },

  save(tokens: AuthTokens): void {
    wx.setStorageSync(KEY, tokens);
  },

  clear(): void {
    wx.removeStorageSync(KEY);
  },
};
