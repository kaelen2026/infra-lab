import type { AuthTokens, CliDeviceTokenResponse, TokenStore } from "@infra/sdk";
import { describe, expect, it, vi } from "vitest";
import { runLoginWeb } from "../src/commands/web-login.js";
import type { CliIO } from "../src/io.js";

const TOKENS: AuthTokens = {
  accessToken: "a",
  accessTokenExpiresIn: 900,
  refreshToken: "r",
  refreshTokenExpiresIn: 2_592_000,
  tokenType: "Bearer",
};

function fakeIO(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: { print: (m) => out.push(m), error: (m) => err.push(m), prompt: async () => "" },
  };
}

function memStore(): TokenStore & { saved: AuthTokens | null } {
  const store = {
    saved: null as AuthTokens | null,
    load: async () => store.saved,
    save: async (t: AuthTokens) => {
      store.saved = t;
    },
    clear: async () => {
      store.saved = null;
    },
  };
  return store;
}

const startResponse = {
  ok: true as const,
  deviceCode: "dc-secret",
  userCode: "WXYZ-2345",
  verificationUri: "http://web.local/auth/cli",
  expiresIn: 900,
  interval: 1,
};

function deps(overrides: {
  poll: () => Promise<CliDeviceTokenResponse>;
  openUrl?: (url: string) => void;
  tokens?: ReturnType<typeof memStore>;
}) {
  const io = fakeIO();
  const tokens = overrides.tokens ?? memStore();
  const openUrl = vi.fn(overrides.openUrl ?? (() => {}));
  return {
    io,
    tokens,
    openUrl,
    args: {
      apiUrl: "http://api.local",
      tokens,
      io: io.io,
      deviceId: "dev-1",
      openUrl,
      requestCode: async () => startResponse,
      pollToken: overrides.poll,
      sleep: async () => {},
    },
  };
}

describe("runLoginWeb (device flow)", () => {
  it("opens the verification URL then saves tokens once approved", async () => {
    let calls = 0;
    const d = deps({
      poll: async () => {
        calls += 1;
        if (calls < 2) return { ok: false, status: "authorization_pending" };
        return { ok: true, user: { phone: "+8613800138000" } as never, tokens: TOKENS };
      },
    });

    const code = await runLoginWeb(d.args);

    expect(code).toBe(0);
    expect(d.tokens.saved).toEqual(TOKENS);
    expect(d.openUrl).toHaveBeenCalledOnce();
    expect(d.openUrl.mock.calls[0]?.[0]).toContain("user_code=WXYZ-2345");
    expect(d.io.out.some((l) => l.includes("已登录"))).toBe(true);
  });

  it("recovers from slow_down and keeps polling", async () => {
    const seq: CliDeviceTokenResponse[] = [
      { ok: false, status: "slow_down" },
      { ok: false, status: "authorization_pending" },
      { ok: true, user: { phone: "+86" } as never, tokens: TOKENS },
    ];
    let i = 0;
    const d = deps({ poll: async () => seq[i++] ?? { ok: false, status: "expired_token" } });
    expect(await runLoginWeb(d.args)).toBe(0);
    expect(d.tokens.saved).toEqual(TOKENS);
  });

  it("returns 1 and saves nothing when the browser denies", async () => {
    const d = deps({ poll: async () => ({ ok: false, status: "access_denied" }) });
    expect(await runLoginWeb(d.args)).toBe(1);
    expect(d.tokens.saved).toBeNull();
    expect(d.io.err.join("\n")).toContain("拒绝");
  });

  it("returns 1 when the code has expired", async () => {
    const d = deps({ poll: async () => ({ ok: false, status: "expired_token" }) });
    expect(await runLoginWeb(d.args)).toBe(1);
    expect(d.io.err.join("\n")).toContain("过期");
  });
});
