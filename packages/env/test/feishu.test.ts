import { describe, expect, it } from "vitest";
import { parseFeishuEnv } from "../src/feishu.js";

describe("parseFeishuEnv", () => {
  it("never throws on an empty bag; leaves credentials undefined", () => {
    const env = parseFeishuEnv({});
    expect(env.LARK_APP_ID).toBeUndefined();
    expect(env.LARK_APP_SECRET).toBeUndefined();
    expect(env.FEISHU_BOT_OPEN_ID).toBeUndefined();
    expect(env.INFRA_LAB_BOT_GITHUB_TOKEN).toBeUndefined();
    expect(env.LLM_BASE_URL).toBeUndefined();
  });

  it('defaults LARK_DOMAIN to Feishu unless it is exactly "Lark"', () => {
    expect(parseFeishuEnv({}).LARK_DOMAIN).toBe("Feishu");
    expect(parseFeishuEnv({ LARK_DOMAIN: "" }).LARK_DOMAIN).toBe("Feishu");
    expect(parseFeishuEnv({ LARK_DOMAIN: "feishu" }).LARK_DOMAIN).toBe("Feishu");
    expect(parseFeishuEnv({ LARK_DOMAIN: "Lark" }).LARK_DOMAIN).toBe("Lark");
  });

  it("defaults INFRA_LAB_BOT_GITHUB_REF to main", () => {
    expect(parseFeishuEnv({}).INFRA_LAB_BOT_GITHUB_REF).toBe("main");
    expect(parseFeishuEnv({ INFRA_LAB_BOT_GITHUB_REF: "" }).INFRA_LAB_BOT_GITHUB_REF).toBe("main");
    expect(parseFeishuEnv({ INFRA_LAB_BOT_GITHUB_REF: "dev" }).INFRA_LAB_BOT_GITHUB_REF).toBe(
      "dev",
    );
  });

  it("treats empty strings as unset for credentials", () => {
    const env = parseFeishuEnv({ LARK_APP_ID: "", LLM_API_KEY: "" });
    expect(env.LARK_APP_ID).toBeUndefined();
    expect(env.LLM_API_KEY).toBeUndefined();
  });

  it("passes through provided values", () => {
    const env = parseFeishuEnv({
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

  it("reads process.env by default (live, not memoized)", () => {
    delete process.env.FEISHU_BOT_OPEN_ID;
    expect(parseFeishuEnv().FEISHU_BOT_OPEN_ID).toBeUndefined();
    process.env.FEISHU_BOT_OPEN_ID = "ou_live";
    expect(parseFeishuEnv().FEISHU_BOT_OPEN_ID).toBe("ou_live");
    delete process.env.FEISHU_BOT_OPEN_ID;
  });
});
