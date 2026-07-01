import { describe, expect, it, vi } from "vitest";
import { createAppTokenProvider } from "../src/github-app-token";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** 造一个假的 GitHub API fetch：/app/installations → 列表；access_tokens → 签发 token。 */
function makeFetch(opts: { installations?: unknown; tokenBody?: unknown; tokenStatus?: number }) {
  return vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/app/installations")) {
      return jsonResponse(opts.installations ?? [{ id: 42, account: { login: "kaelen2026" } }]);
    }
    if (u.includes("/access_tokens")) {
      return jsonResponse(
        opts.tokenBody ?? { token: "ghs_minted", expires_at: "2026-07-01T09:00:00Z" },
        opts.tokenStatus ?? 201,
      );
    }
    throw new Error(`unexpected url ${u}`);
  });
}

const baseCfg = {
  clientId: "Iv23liXXXX",
  privateKey: "-----BEGIN KEY-----\nfake\n-----END KEY-----",
  owner: "kaelen2026",
  repo: "infra-lab",
};
const signJwt = () => "fake.jwt.sig";

describe("createAppTokenProvider", () => {
  it("配了静态 token 时直接返回，不签 JWT、不发请求", async () => {
    const fetchImpl = makeFetch({});
    const sign = vi.fn(signJwt);
    const p = createAppTokenProvider(
      { ...baseCfg, staticToken: "ghp_static" },
      { fetchImpl, now: () => 0, signJwt: sign },
    );
    expect(await p.getToken()).toBe("ghp_static");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
  });

  it("无静态 token 时用 App 换发 installation token", async () => {
    const fetchImpl = makeFetch({});
    const p = createAppTokenProvider(baseCfg, {
      fetchImpl,
      now: () => Date.parse("2026-07-01T08:00:00Z"),
      signJwt,
    });
    expect(await p.getToken()).toBe("ghs_minted");
    // 两次调用：列 installations + 换 token
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("有效期内复用缓存，不重复换发", async () => {
    const fetchImpl = makeFetch({});
    let t = Date.parse("2026-07-01T08:00:00Z"); // token 到 09:00 过期
    const p = createAppTokenProvider(baseCfg, { fetchImpl, now: () => t, signJwt });
    await p.getToken();
    t = Date.parse("2026-07-01T08:30:00Z"); // 距过期 30min > 5min 缓冲
    await p.getToken();
    expect(fetchImpl).toHaveBeenCalledTimes(2); // 仍是第一次那两发
  });

  it("接近过期时自动续期", async () => {
    const fetchImpl = makeFetch({});
    let t = Date.parse("2026-07-01T08:00:00Z");
    const p = createAppTokenProvider(baseCfg, { fetchImpl, now: () => t, signJwt });
    await p.getToken();
    t = Date.parse("2026-07-01T08:57:00Z"); // 距 09:00 过期仅 3min < 5min 缓冲 → 续期
    await p.getToken();
    expect(fetchImpl).toHaveBeenCalledTimes(4); // 两轮各两发
  });

  it("找不到对应 owner 的 installation 时抛错", async () => {
    const fetchImpl = makeFetch({ installations: [{ id: 1, account: { login: "someone-else" } }] });
    const p = createAppTokenProvider(baseCfg, { fetchImpl, now: () => 0, signJwt });
    await expect(p.getToken()).rejects.toThrow(/installation/);
  });

  it("既无静态 token 又无 App 凭证时抛错", async () => {
    const fetchImpl = makeFetch({});
    const p = createAppTokenProvider(
      { owner: "kaelen2026", repo: "infra-lab" },
      { fetchImpl, now: () => 0, signJwt },
    );
    await expect(p.getToken()).rejects.toThrow(/App 凭证|INFRA_LAB_BOT/);
  });

  it("换 token 返回非 2xx 时抛错", async () => {
    const fetchImpl = makeFetch({ tokenBody: { message: "nope" }, tokenStatus: 403 });
    const p = createAppTokenProvider(baseCfg, { fetchImpl, now: () => 0, signJwt });
    await expect(p.getToken()).rejects.toThrow(/换 installation token 失败/);
  });
});
