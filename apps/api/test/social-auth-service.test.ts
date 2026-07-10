import type { Auth } from "@infra/auth";
import type { SocialProvider } from "@infra/shared";
import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";
import { createSocialAuthService } from "../src/services/social-auth-service.js";

// Build a fake Better Auth whose `api.signInSocial` returns a value or throws. We only
// exercise the adapter's mapping — Better Auth's own verification is covered upstream.
function authWith(signInSocial: (args: unknown) => Promise<unknown>): Auth {
  return { api: { signInSocial } } as unknown as Auth;
}

const enabled: ReadonlySet<SocialProvider> = new Set<SocialProvider>(["google"]);

describe("social auth service — isEnabled", () => {
  it("reflects the configured provider set", () => {
    const svc = createSocialAuthService({
      auth: authWith(async () => ({})),
      enabledProviders: enabled,
    });
    expect(svc.isEnabled("google")).toBe(true);
    const none = createSocialAuthService({
      auth: authWith(async () => ({})),
      enabledProviders: new Set<SocialProvider>(),
    });
    expect(none.isEnabled("google")).toBe(false);
  });
});

describe("social auth service — signInWithIdToken", () => {
  it("maps a successful sign-in to our user id + provider hints", async () => {
    const svc = createSocialAuthService({
      auth: authWith(async () => ({
        redirect: false,
        token: "ba_session_token",
        user: { id: "user_1", name: "Ada", image: "https://x/a.png", email: "a@b.com" },
      })),
      enabledProviders: enabled,
    });
    const out = await svc.signInWithIdToken({ provider: "google", idToken: "eyJ.fake" });
    expect(out).toEqual({
      ok: true,
      data: { userId: "user_1", displayName: "Ada", avatarUrl: "https://x/a.png" },
    });
  });

  it("forwards nonce + accessToken into the Better Auth idToken body", async () => {
    let seen: any;
    const svc = createSocialAuthService({
      auth: authWith(async (args) => {
        seen = args;
        return { user: { id: "u" } };
      }),
      enabledProviders: enabled,
    });
    await svc.signInWithIdToken({
      provider: "google",
      idToken: "tok",
      nonce: "n1",
      accessToken: "at1",
    });
    expect(seen.body).toEqual({
      provider: "google",
      idToken: { token: "tok", nonce: "n1", accessToken: "at1" },
    });
  });

  it("maps an INVALID_TOKEN APIError to SOCIAL_TOKEN_INVALID", async () => {
    const svc = createSocialAuthService({
      auth: authWith(async () => {
        throw new APIError("UNAUTHORIZED", { message: "Invalid token", code: "INVALID_TOKEN" });
      }),
      enabledProviders: enabled,
    });
    const out = await svc.signInWithIdToken({ provider: "google", idToken: "bad" });
    expect(out).toEqual({ ok: false, error: "SOCIAL_TOKEN_INVALID" });
  });

  it("maps any other APIError code to SOCIAL_ACCOUNT_ERROR", async () => {
    const svc = createSocialAuthService({
      auth: authWith(async () => {
        throw new APIError("BAD_REQUEST", { message: "no email", code: "USER_EMAIL_NOT_FOUND" });
      }),
      enabledProviders: enabled,
    });
    const out = await svc.signInWithIdToken({ provider: "google", idToken: "x" });
    expect(out).toEqual({ ok: false, error: "SOCIAL_ACCOUNT_ERROR" });
  });

  it("maps a missing user in the result to SOCIAL_ACCOUNT_ERROR", async () => {
    const svc = createSocialAuthService({
      auth: authWith(async () => ({ redirect: false, token: "t" })), // no user
      enabledProviders: enabled,
    });
    const out = await svc.signInWithIdToken({ provider: "google", idToken: "x" });
    expect(out).toEqual({ ok: false, error: "SOCIAL_ACCOUNT_ERROR" });
  });

  it("rethrows a non-APIError (unexpected) so it surfaces as a 500", async () => {
    const svc = createSocialAuthService({
      auth: authWith(async () => {
        throw new Error("connection reset");
      }),
      enabledProviders: enabled,
    });
    await expect(svc.signInWithIdToken({ provider: "google", idToken: "x" })).rejects.toThrow(
      "connection reset",
    );
  });
});
