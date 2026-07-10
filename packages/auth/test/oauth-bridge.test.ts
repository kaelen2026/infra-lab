import { describe, expect, it } from "vitest";
import { bridgeOAuthCallbackSession, type OAuthCallbackCtx } from "../src/better-auth.js";

const BA_COOKIES = {
  sessionToken: { name: "__Secure-infra.session_token" },
  sessionData: { name: "__Secure-infra.session_data" },
  dontRememberToken: { name: "__Secure-infra.dont_remember" },
  accountData: { name: "__Secure-infra.account_data" },
};

const OUR_COOKIE = "infra.session=ours; Path=/; HttpOnly; SameSite=Lax";

function makeCtx(over: {
  path?: string;
  params?: Record<string, string | undefined>;
  newSession?: { user?: { id?: string; name?: string | null; image?: string | null } } | null;
  cookies?: string[];
  location?: string;
  omitHeaders?: boolean;
}): OAuthCallbackCtx {
  const headers = new Headers();
  for (const c of over.cookies ?? [
    "__Secure-infra.session_token=ba-token; Path=/; HttpOnly",
    "__Secure-infra.session_data.0=chunk; Path=/",
    "keep_me=1; Path=/",
  ]) {
    headers.append("set-cookie", c);
  }
  headers.set("location", over.location ?? "https://app.example/account");
  return {
    path: over.path ?? "/callback/:id",
    params: "params" in over ? over.params : { id: "google" },
    context: {
      newSession: "newSession" in over ? over.newSession : { user: { id: "u1" } },
      responseHeaders: over.omitHeaders ? undefined : headers,
      authCookies: BA_COOKIES,
    },
  };
}

describe("bridgeOAuthCallbackSession", () => {
  it("strips Better Auth session cookies, keeps others + Location, appends our cookie", async () => {
    const ctx = makeCtx({});
    await bridgeOAuthCallbackSession(ctx, () => OUR_COOKIE);

    const setCookies = ctx.context.responseHeaders?.getSetCookie() ?? [];
    // BA's own session cookies (exact name and chunk) are gone.
    expect(setCookies.some((c) => c.startsWith("__Secure-infra.session_token="))).toBe(false);
    expect(setCookies.some((c) => c.startsWith("__Secure-infra.session_data.0="))).toBe(false);
    // Unrelated cookies survive.
    expect(setCookies.some((c) => c.startsWith("keep_me="))).toBe(true);
    // Our session cookie is delivered.
    expect(setCookies.some((c) => c.startsWith("infra.session=ours"))).toBe(true);
    // The 302 target is untouched.
    expect(ctx.context.responseHeaders?.get("location")).toBe("https://app.example/account");
  });

  it("hands the signed-in user (id + provider hints) to the minter", async () => {
    let seen: { userId: string; name: string | null; image: string | null } | null = null;
    await bridgeOAuthCallbackSession(
      makeCtx({ newSession: { user: { id: "user-42", name: "Ada", image: "https://x/a.png" } } }),
      (info) => {
        seen = info;
        return OUR_COOKIE;
      },
    );
    expect(seen).toEqual({ userId: "user-42", name: "Ada", image: "https://x/a.png" });
  });

  it("awaits an async minter (profile/audit side effects) before returning", async () => {
    const ctx = makeCtx({});
    await bridgeOAuthCallbackSession(ctx, async () => {
      await Promise.resolve();
      return OUR_COOKIE;
    });
    expect(
      (ctx.context.responseHeaders?.getSetCookie() ?? []).some((c) =>
        c.startsWith("infra.session=ours"),
      ),
    ).toBe(true);
  });

  it("no-ops for a non-callback path (e.g. the native /sign-in/social)", async () => {
    const ctx = makeCtx({ path: "/sign-in/social" });
    const before = ctx.context.responseHeaders?.getSetCookie();
    await bridgeOAuthCallbackSession(ctx, () => OUR_COOKIE);
    expect(ctx.context.responseHeaders?.getSetCookie()).toEqual(before);
  });

  it("no-ops when there is no new session (error/redirect hop)", async () => {
    const ctx = makeCtx({ newSession: null });
    await bridgeOAuthCallbackSession(ctx, () => OUR_COOKIE);
    expect(
      ctx.context.responseHeaders?.getSetCookie().some((c) => c.startsWith("infra.session=")),
    ).toBe(false);
  });

  it("no-ops when the callback has no provider param", async () => {
    const ctx = makeCtx({ params: {} });
    await bridgeOAuthCallbackSession(ctx, () => OUR_COOKIE);
    expect(
      ctx.context.responseHeaders?.getSetCookie().some((c) => c.startsWith("infra.session=")),
    ).toBe(false);
  });

  it("no-ops (does not throw) when the minter returns null", async () => {
    const ctx = makeCtx({});
    await bridgeOAuthCallbackSession(ctx, () => null);
    const setCookies = ctx.context.responseHeaders?.getSetCookie() ?? [];
    // Nothing minted → we bail before stripping, leaving BA's cookies as-is.
    expect(setCookies.some((c) => c.startsWith("infra.session="))).toBe(false);
    expect(setCookies.some((c) => c.startsWith("__Secure-infra.session_token="))).toBe(true);
  });

  it("tolerates a missing responseHeaders", async () => {
    await expect(
      bridgeOAuthCallbackSession(makeCtx({ omitHeaders: true }), () => OUR_COOKIE),
    ).resolves.toBeUndefined();
  });
});
