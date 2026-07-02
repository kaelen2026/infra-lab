import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchBot, uuidV5 } from "../src/bot-dispatch-handler";
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

  it("透传 thread_key 并派生稳定的 session_uuid（话题多轮）", async () => {
    const { fetchImpl, lastBody } = makeFetch();
    await dispatchBot("t", "om_root", "m", { tokens, fetchImpl });
    const first = (lastBody() as { inputs: Record<string, string> }).inputs;
    expect(first.thread_key).toBe("om_root");
    // RFC 4122：version 位是 5，variant 高两位是 10
    expect(first.session_uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    // 同一 threadKey 再派发一次 → 同一个 session_uuid（跨 run 接得上 session）
    await dispatchBot("另一条追问", "om_root", "m2", { tokens, fetchImpl });
    const second = (lastBody() as { inputs: Record<string, string> }).inputs;
    expect(second.session_uuid).toBe(first.session_uuid);

    // 不同 threadKey → 不同 session（互不串台）
    await dispatchBot("t", "om_other", "m3", { tokens, fetchImpl });
    const third = (lastBody() as { inputs: Record<string, string> }).inputs;
    expect(third.session_uuid).not.toBe(first.session_uuid);
  });
});

describe("uuidV5", () => {
  it("与 RFC 4122 参考实现一致（uuid 包 v5(name, DNS namespace) 的已知值）", () => {
    // 参考值：uuidv5("www.example.com", NameSpace_DNS) 的标准结果
    expect(uuidV5("6ba7b810-9dad-11d1-80b4-00c04fd430c8", "www.example.com")).toBe(
      "2ed6657d-e927-568b-95e1-2665a8aea6a2",
    );
  });

  it("非法 namespace 直接抛错", () => {
    expect(() => uuidV5("not-a-uuid", "x")).toThrow(/非法 UUID/);
  });
});
