import { describe, expect, it } from "vitest";
import { parseBotEnv } from "../src/bot.js";

describe("parseBotEnv", () => {
  it("never throws on an empty bag; leaves credentials undefined", () => {
    const env = parseBotEnv({});
    expect(env.LARK_APP_ID).toBeUndefined();
    expect(env.LARK_APP_SECRET).toBeUndefined();
    expect(env.FEISHU_BOT_OPEN_ID).toBeUndefined();
    expect(env.INFRA_LAB_BOT_GITHUB_TOKEN).toBeUndefined();
    expect(env.LLM_BASE_URL).toBeUndefined();
  });

  it('defaults LARK_DOMAIN to Feishu unless it is exactly "Lark"', () => {
    expect(parseBotEnv({}).LARK_DOMAIN).toBe("Feishu");
    expect(parseBotEnv({ LARK_DOMAIN: "" }).LARK_DOMAIN).toBe("Feishu");
    expect(parseBotEnv({ LARK_DOMAIN: "feishu" }).LARK_DOMAIN).toBe("Feishu");
    expect(parseBotEnv({ LARK_DOMAIN: "Lark" }).LARK_DOMAIN).toBe("Lark");
  });

  it("defaults INFRA_LAB_BOT_GITHUB_REF to main", () => {
    expect(parseBotEnv({}).INFRA_LAB_BOT_GITHUB_REF).toBe("main");
    expect(parseBotEnv({ INFRA_LAB_BOT_GITHUB_REF: "" }).INFRA_LAB_BOT_GITHUB_REF).toBe("main");
    expect(parseBotEnv({ INFRA_LAB_BOT_GITHUB_REF: "dev" }).INFRA_LAB_BOT_GITHUB_REF).toBe("dev");
  });

  it("treats empty strings as unset for credentials", () => {
    const env = parseBotEnv({ LARK_APP_ID: "", LLM_API_KEY: "" });
    expect(env.LARK_APP_ID).toBeUndefined();
    expect(env.LLM_API_KEY).toBeUndefined();
  });

  it("passes through provided values", () => {
    const env = parseBotEnv({
      LARK_APP_ID: "cli_x",
      LARK_APP_SECRET: "sec",
      FEISHU_BOT_OPEN_ID: "ou_bot",
      INFRA_LAB_BOT_GITHUB_REPO: "owner/repo",
      LLM_BASE_URL: "https://gw/v1",
      LLM_API_KEY: "k",
      LLM_MODEL: "m",
    });
    expect(env.LARK_APP_ID).toBe("cli_x");
    expect(env.INFRA_LAB_BOT_GITHUB_REPO).toBe("owner/repo");
    expect(env.LLM_MODEL).toBe("m");
  });

  it("carries the App dispatch-auth fields (client id + private key inline/path)", () => {
    const env = parseBotEnv({
      INFRA_LAB_BOT_CLIENT_ID: "Iv23liXXXX",
      INFRA_LAB_BOT_PRIVATE_KEY: "-----BEGIN-----\\nk\\n-----END-----",
      INFRA_LAB_BOT_PRIVATE_KEY_PATH: "/keys/bot.pem",
    });
    expect(env.INFRA_LAB_BOT_CLIENT_ID).toBe("Iv23liXXXX");
    expect(env.INFRA_LAB_BOT_PRIVATE_KEY).toContain("BEGIN");
    expect(env.INFRA_LAB_BOT_PRIVATE_KEY_PATH).toBe("/keys/bot.pem");
    // all optional: absent bag leaves them undefined
    const empty = parseBotEnv({});
    expect(empty.INFRA_LAB_BOT_CLIENT_ID).toBeUndefined();
    expect(empty.INFRA_LAB_BOT_PRIVATE_KEY).toBeUndefined();
    expect(empty.INFRA_LAB_BOT_PRIVATE_KEY_PATH).toBeUndefined();
  });

  it("reads process.env by default (live, not memoized)", () => {
    delete process.env.FEISHU_BOT_OPEN_ID;
    expect(parseBotEnv().FEISHU_BOT_OPEN_ID).toBeUndefined();
    process.env.FEISHU_BOT_OPEN_ID = "ou_live";
    expect(parseBotEnv().FEISHU_BOT_OPEN_ID).toBe("ou_live");
    delete process.env.FEISHU_BOT_OPEN_ID;
  });
});
