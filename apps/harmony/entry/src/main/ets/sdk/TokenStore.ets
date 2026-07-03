import { AuthTokens } from "../common/contracts";

/**
 * Pluggable secure token storage shared by every authorized client (auth / todo).
 * HarmonyOS backs this with HUKS-encrypted Preferences ({@link HuksTokenStore});
 * tests can inject an in-memory fake.
 *
 * Lives in its own module (mirroring iOS `TokenStore.swift`) so the transport /
 * refresher can depend on it without importing {@link HarmonyAuthClient} — that
 * would form an import cycle.
 */
export interface TokenStore {
  load(): Promise<AuthTokens | null>;
  save(tokens: AuthTokens): Promise<void>;
  clear(): Promise<void>;
}
