import type { Auth } from "@infra/auth";
import { SOCIAL_PROVIDERS, type SocialProvider } from "@infra/shared";
import { APIError } from "better-auth/api";
import type {
  AccountLinkService,
  LinkSocialOutcome,
  LinkStartOutcome,
} from "../routes/account-link.routes.js";

export interface AccountLinkServiceConfig {
  /** Better Auth instance — its account endpoints + internal adapter own the `account` table. */
  auth: Auth;
  /** Providers with server-side credentials configured (else linking is disabled). */
  enabledProviders: ReadonlySet<SocialProvider>;
}

const isSocialProvider = (p: string): p is SocialProvider =>
  (SOCIAL_PROVIDERS as readonly string[]).includes(p);

/**
 * Decode an OIDC ID token's `sub` (the stable provider account id) WITHOUT verifying
 * the signature — used only for the cross-user pre-check before we hand the token to
 * Better Auth (which does verify it). Best-effort: a malformed token yields null and
 * the real verification downstream produces the authoritative error.
 */
function decodeIdTokenSub(idToken: string): string | null {
  const payload = idToken.split(".")[1];
  if (!payload) return null;
  try {
    const json: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const sub = (json as { sub?: unknown }).sub;
    return typeof sub === "string" ? sub : null;
  } catch {
    return null;
  }
}

/**
 * {@link AccountLinkService} backed by Better Auth's account endpoints + internal
 * adapter. Linking uses `auth.api.linkSocialAccount` (which verifies + attaches to the
 * session user, minting NO session — so our OAuth-callback bridge is untouched); we add
 * the cross-user and one-per-provider guards on top because Better Auth's own guards
 * don't model our phone credential and don't reject cross-user links on a bare schema.
 */
export function createAccountLinkService(config: AccountLinkServiceConfig): AccountLinkService {
  const { auth, enabledProviders } = config;

  return {
    isEnabled(provider) {
      return enabledProviders.has(provider);
    },

    async listProviders(userId) {
      const ctx = await auth.$context;
      const accounts = await ctx.internalAdapter.findAccounts(userId);
      const providers = new Set<SocialProvider>();
      for (const a of accounts) if (isSocialProvider(a.providerId)) providers.add(a.providerId);
      return [...providers];
    },

    async linkIdToken({
      userId,
      headers,
      provider,
      idToken,
      nonce,
      accessToken,
    }): Promise<LinkSocialOutcome> {
      const ctx = await auth.$context;

      // One provider account per user (this period): refuse a second Google link.
      const existing = await ctx.internalAdapter.findAccounts(userId);
      if (existing.some((a) => a.providerId === provider)) {
        return { ok: false, error: "SOCIAL_ALREADY_LINKED" };
      }
      // Cross-user: the provider account (sub) must not already belong to someone else.
      const sub = decodeIdTokenSub(idToken);
      if (sub) {
        const owner = await ctx.internalAdapter.findAccountByProviderId(sub, provider);
        if (owner && owner.userId !== userId) return { ok: false, error: "SOCIAL_ALREADY_LINKED" };
      }

      try {
        await auth.api.linkSocialAccount({
          body: {
            provider,
            idToken: {
              token: idToken,
              ...(nonce ? { nonce } : {}),
              ...(accessToken ? { accessToken } : {}),
            },
          },
          headers,
        });
        return { ok: true };
      } catch (err) {
        if (err instanceof APIError) {
          const code = (err.body as { code?: string } | undefined)?.code;
          if (code === "INVALID_TOKEN" || code === "ID_TOKEN_NOT_SUPPORTED") {
            return { ok: false, error: "SOCIAL_TOKEN_INVALID" };
          }
          // The unique index rejects a racing cross-user link → LINKING_FAILED here.
          if (code === "LINKING_FAILED") return { ok: false, error: "SOCIAL_ALREADY_LINKED" };
          return { ok: false, error: "SOCIAL_ACCOUNT_ERROR" };
        }
        throw err;
      }
    },

    async startWebLink({ headers, provider, callbackURL }): Promise<LinkStartOutcome> {
      try {
        const res = (await auth.api.linkSocialAccount({
          body: { provider, callbackURL },
          headers,
        })) as { url?: string };
        if (!res.url) return { ok: false, error: "SOCIAL_ACCOUNT_ERROR" };
        return { ok: true, url: res.url };
      } catch (err) {
        if (err instanceof APIError) return { ok: false, error: "SOCIAL_ACCOUNT_ERROR" };
        throw err;
      }
    },

    async unlinkProvider(userId, provider) {
      const ctx = await auth.$context;
      const accounts = await ctx.internalAdapter.findAccounts(userId);
      const mine = accounts.filter((a) => a.providerId === provider);
      for (const a of mine) await ctx.internalAdapter.deleteAccount(a.id);
      return mine.length;
    },
  };
}
