import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchBot } from "../src/bot-dispatch-handler";
import type { TokenProvider } from "../src/github-app-token";

const tokens: TokenProvider = { getToken: async () => "ghs_test" };

/** 204 = workflow_dispatch 成功。返回捕获到的请求 body 供断言。 */
function makeFetch(): { fetchImpl: typeof fetch; lastBody: () => unknown } {
  let captured: unknown;
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    captured = init?.body ? JSON.parse(String(init.body)) : undefined;
    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;
  return { fetchImpl, lastBody: () => captured };
}

beforeEach(() => {
  process.env.INFRA_LAB_BOT_GITHUB_REPO = "kaelen2026/infra-lab";
});

afterEach(() => {
  process.env.INFRA_LAB_BOT_GITHUB_REPO = undefined;
  vi.restoreAllMocks();
});

describe("dispatchBot inputs", () => {
  it("带发起人时透传 feishu_sender + feishu_sender_name", async () => {
    const { fetchImpl, lastBody } = makeFetch();
    const r = await dispatchBot("task text", "om_root", "om_msg", {
      tokens,
      fetchImpl,
      sender: { openId: "ou_abc", name: "张三" },
    });
    expect(r.ok).toBe(true);
    const inputs = (lastBody() as { inputs: Record<string, string> }).inputs;
    expect(inputs.prompt).toBe("task text");
    expect(inputs.feishu_message_id).toBe("om_msg");
    expect(inputs.feishu_sender).toBe("ou_abc");
    expect(inputs.feishu_sender_name).toBe("张三");
  });

  it("有 open_id 无姓名时只传 feishu_sender", async () => {
    const { fetchImpl, lastBody } = makeFetch();
    await dispatchBot("t", "k", "m", { tokens, fetchImpl, sender: { openId: "ou_abc" } });
    const inputs = (lastBody() as { inputs: Record<string, string> }).inputs;
    expect(inputs.feishu_sender).toBe("ou_abc");
    expect("feishu_sender_name" in inputs).toBe(false);
  });

  it("无发起人（人工派发）时完全不带 feishu_sender* 字段", async () => {
    const { fetchImpl, lastBody } = makeFetch();
    await dispatchBot("t", "k", "m", { tokens, fetchImpl });
    const inputs = (lastBody() as { inputs: Record<string, string> }).inputs;
    expect("feishu_sender" in inputs).toBe(false);
    expect("feishu_sender_name" in inputs).toBe(false);
  });
});
