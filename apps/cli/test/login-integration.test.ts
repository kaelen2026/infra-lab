import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AuthTokens } from "@infra/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { credentialsPath, deviceIdPath, type Env } from "../src/config.js";
import { run } from "../src/index.js";
import type { CliIO } from "../src/io.js";

const TOKENS: AuthTokens = {
  accessToken: "access-abc",
  accessTokenExpiresIn: 900,
  refreshToken: "refresh-xyz",
  refreshTokenExpiresIn: 2_592_000,
  tokenType: "Bearer",
};

// Minimal fake of the two endpoints `auth login` hits, wired through the real SDK.
function fakeApi(): typeof fetch {
  return (async (input: string | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/auth/otp/request")) {
      return new Response(JSON.stringify({ ok: true, ttlSeconds: 300, resendAfterSeconds: 60 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/auth/otp/verify")) {
      const user = {
        id: "u_1",
        phone: "+8613800138000",
        displayName: null,
        avatarUrl: null,
        createdAt: "2026-07-03T00:00:00.000Z",
        isNew: false,
      };
      return new Response(JSON.stringify({ ok: true, user, tokens: TOKENS }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unexpected request: ${url}`);
  }) as unknown as typeof fetch;
}

describe("run auth login (end-to-end wiring)", () => {
  let env: Env;

  beforeEach(async () => {
    const dir = await mkdtemp(join(tmpdir(), "infra-cli-login-"));
    env = { XDG_CONFIG_HOME: dir };
  });

  it("persists the returned tokens to the 0600 credentials file", async () => {
    const answers = ["+8613800138000", "123456"];
    let i = 0;
    const io: CliIO = {
      print: () => {},
      error: () => {},
      prompt: async () => answers[i++] ?? "",
    };

    const code = await run(["auth", "login"], env, io, fakeApi());
    expect(code).toBe(0);

    const saved = JSON.parse(await readFile(credentialsPath(env), "utf8")) as AuthTokens;
    expect(saved).toEqual(TOKENS);

    // A stable device id was created for the login.
    const device = JSON.parse(await readFile(deviceIdPath(env), "utf8")) as { deviceId: string };
    expect(device.deviceId).toHaveLength(36);
  });
});
