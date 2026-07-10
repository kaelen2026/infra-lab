import type { Auth } from "@infra/auth";
import type { SocialProvider } from "@infra/shared";
import { APIError } from "better-auth/api";
import type { SocialAuthService, SocialSignInOutcome } from "../routes/social.routes.js";

export interface SocialAuthServiceConfig {
  /** Better Auth instance; its `signInSocial` verifies the token + finds-or-creates. */
  auth: Auth;
  /** Providers with server-side credentials configured (else the route 400s). */
  enabledProviders: ReadonlySet<SocialProvider>;
}

/** Shape we read off Better Auth's `signInSocial` idToken result (`{ user, token }`). */
interface SignInSocialResult {
  user?: { id: string; name?: string | null; image?: string | null };
}

/**
 * {@link SocialAuthService} backed by Better Auth. The native ID-token flow calls
 * `auth.api.signInSocial({ body: { provider, idToken } })`, which verifies the token
 * against the provider's JWKS (audience = configured clientId), finds-or-creates the
 * `user` + `account`, and returns the resolved user. We take only `user.id` and hand
 * it to our own `SessionService` — Better Auth's own session/cookie is discarded, so
 * a social session is identical downstream to an OTP one.
 */
export function createSocialAuthService(config: SocialAuthServiceConfig): SocialAuthService {
  const { auth, enabledProviders } = config;

  return {
    isEnabled(provider) {
      return enabledProviders.has(provider);
    },

    async signInWithIdToken({
      provider,
      idToken,
      nonce,
      accessToken,
    }): Promise<SocialSignInOutcome> {
      try {
        const result = (await auth.api.signInSocial({
          body: {
            provider,
            idToken: {
              token: idToken,
              ...(nonce ? { nonce } : {}),
              ...(accessToken ? { accessToken } : {}),
            },
          },
        })) as SignInSocialResult;

        const user = result.user;
        if (!user?.id) return { ok: false, error: "SOCIAL_ACCOUNT_ERROR" };
        return {
          ok: true,
          data: {
            userId: user.id,
            displayName: user.name ?? null,
            avatarUrl: user.image ?? null,
          },
        };
      } catch (err) {
        // Better Auth reports expected failures as an APIError carrying a stable
        // `code`. A token that fails verification maps to SOCIAL_TOKEN_INVALID; every
        // other reported failure (email missing, sign-up disabled, link error) is a
        // SOCIAL_ACCOUNT_ERROR. Anything that is NOT an APIError is unexpected — let
        // it bubble to app.onError as a generic 500.
        if (err instanceof APIError) {
          const code = (err.body as { code?: string } | undefined)?.code;
          if (code === "INVALID_TOKEN" || code === "ID_TOKEN_NOT_SUPPORTED") {
            return { ok: false, error: "SOCIAL_TOKEN_INVALID" };
          }
          return { ok: false, error: "SOCIAL_ACCOUNT_ERROR" };
        }
        throw err;
      }
    },
  };
}
