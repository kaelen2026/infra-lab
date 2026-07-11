import type { AuthClient } from "@infra/sdk";
import { HttpAuthError } from "@infra/sdk";
import type { AuthUser, VerifyOtpInput } from "@infra/shared";
import { describe, expect, it, vi } from "vitest";
import { withRefresh } from "../src/client.js";
import { runLogin, runWhoami } from "../src/commands/auth.js";
import type { CliIO } from "../src/io.js";

function fakeIO(answers: string[] = []): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  let i = 0;
  return {
    out,
    err,
    io: {
      print: (m) => out.push(m),
      error: (m) => err.push(m),
      prompt: async () => answers[i++] ?? "",
    },
  };
}

const USER: AuthUser = {
  id: "u_1",
  phone: "+8613800138000",
  email: null,
  displayName: null,
  avatarUrl: null,
  createdAt: "2026-07-03T00:00:00.000Z",
  isNew: true,
};

describe("runLogin", () => {
  it("requests an OTP then verifies with platform=cli and the device id", async () => {
    let verifyArg: VerifyOtpInput | undefined;
    const auth = {
      requestOtp: vi.fn(async () => ({ ok: true, ttlSeconds: 300, resendAfterSeconds: 60 })),
      verifyOtp: vi.fn(async (input: VerifyOtpInput) => {
        verifyArg = input;
        return { ok: true, user: USER };
      }),
    } as unknown as AuthClient;
    const { io, out } = fakeIO(["+8613800138000", "123456"]);

    const code = await runLogin({ auth, io, deviceId: "dev-1" });

    expect(code).toBe(0);
    expect(verifyArg?.platform).toBe("cli");
    expect(verifyArg?.code).toBe("123456");
    expect(verifyArg?.device?.platform).toBe("cli");
    expect(verifyArg?.device?.deviceId).toBe("dev-1");
    expect(out.some((l) => l.includes("已注册并登录"))).toBe(true);
  });
});

describe("runWhoami", () => {
  it("prints a friendly hint and exits 1 when unauthorized", async () => {
    const auth = {
      me: vi.fn(async () => {
        throw new HttpAuthError(401, { code: "UNAUTHORIZED" });
      }),
      refresh: vi.fn(async () => null),
    } as unknown as AuthClient;
    const { io, err } = fakeIO();

    const code = await runWhoami({ auth, io, deviceId: "dev-1" });

    expect(code).toBe(1);
    expect(err.join("\n")).toContain("请先运行");
  });
});

describe("withRefresh", () => {
  it("rotates once on a 401 then retries", async () => {
    let calls = 0;
    const auth = {
      refresh: vi.fn(async () => ({ accessToken: "new" })),
    } as unknown as AuthClient;

    const result = await withRefresh(auth, async () => {
      calls += 1;
      if (calls === 1) throw new HttpAuthError(401, { code: "UNAUTHORIZED" });
      return "ok";
    });

    expect(result).toBe("ok");
    expect(calls).toBe(2);
    expect(auth.refresh).toHaveBeenCalledOnce();
  });

  it("rethrows the 401 when refresh yields no session", async () => {
    const auth = { refresh: vi.fn(async () => null) } as unknown as AuthClient;
    await expect(
      withRefresh(auth, async () => {
        throw new HttpAuthError(401, { code: "UNAUTHORIZED" });
      }),
    ).rejects.toBeInstanceOf(HttpAuthError);
  });
});
