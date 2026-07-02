import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __clearThreadCacheForTest,
  __trackerDeps,
  isBotInThread,
} from "../src/feishu/thread-tracker";

type LarkClient = ReturnType<typeof __trackerDeps.getLarkClient>;

/** 造一个只实现 im.v1.message.get 的假 lark client。 */
function makeClient(
  impl: () => Promise<{
    data?: {
      items?: Array<{
        sender?: { sender_type?: string };
        mentions?: Array<{ id?: string }>;
      }>;
    };
  }>,
): { client: LarkClient; getSpy: ReturnType<typeof vi.fn> } {
  const getSpy = vi.fn(impl);
  const client = {
    im: { v1: { message: { get: getSpy } } },
  } as unknown as LarkClient;
  return { client, getSpy };
}

const realGetLarkClient = __trackerDeps.getLarkClient;

beforeEach(() => {
  __clearThreadCacheForTest();
});

afterEach(() => {
  __trackerDeps.getLarkClient = realGetLarkClient;
  vi.restoreAllMocks();
});

describe("isBotInThread — 话题归属判定", () => {
  it("root 是 bot 自己发的（sender_type=app）→ 参与", async () => {
    const { client } = makeClient(async () => ({
      data: { items: [{ sender: { sender_type: "app" } }] },
    }));
    __trackerDeps.getLarkClient = () => client;
    expect(await isBotInThread("om_root", "ou_bot")).toBe(true);
  });

  it("root 里 @ 了 bot（mentions 含 bot open_id）→ 参与", async () => {
    const { client } = makeClient(async () => ({
      data: {
        items: [{ sender: { sender_type: "user" }, mentions: [{ id: "ou_x" }, { id: "ou_bot" }] }],
      },
    }));
    __trackerDeps.getLarkClient = () => client;
    expect(await isBotInThread("om_root", "ou_bot")).toBe(true);
  });

  it("root 是普通用户消息（无 @ bot）→ 不参与", async () => {
    const { client } = makeClient(async () => ({
      data: { items: [{ sender: { sender_type: "user" }, mentions: [{ id: "ou_other" }] }] },
    }));
    __trackerDeps.getLarkClient = () => client;
    expect(await isBotInThread("om_root", "ou_bot")).toBe(false);
  });

  it("判定结果按 root_id 缓存，同话题第二次不再调 API", async () => {
    const { client, getSpy } = makeClient(async () => ({
      data: { items: [{ sender: { sender_type: "app" } }] },
    }));
    __trackerDeps.getLarkClient = () => client;
    await isBotInThread("om_root", "ou_bot");
    await isBotInThread("om_root", "ou_bot");
    expect(getSpy).toHaveBeenCalledOnce();
  });

  it("lark client 未初始化 → false", async () => {
    __trackerDeps.getLarkClient = () => null;
    expect(await isBotInThread("om_root", "ou_bot")).toBe(false);
  });

  it("拉 root 失败不缓存：下一次重试可翻正", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let calls = 0;
    const { client, getSpy } = makeClient(async () => {
      calls += 1;
      if (calls === 1) throw new Error("网络抖动");
      return { data: { items: [{ sender: { sender_type: "app" } }] } };
    });
    __trackerDeps.getLarkClient = () => client;
    expect(await isBotInThread("om_root", "ou_bot")).toBe(false);
    expect(await isBotInThread("om_root", "ou_bot")).toBe(true);
    expect(getSpy).toHaveBeenCalledTimes(2);
  });

  it("root 查不到（撤回 / 无权限）→ false 且不缓存", async () => {
    let calls = 0;
    const { client, getSpy } = makeClient(async () => {
      calls += 1;
      if (calls === 1) return { data: { items: [] } };
      return { data: { items: [{ sender: { sender_type: "app" } }] } };
    });
    __trackerDeps.getLarkClient = () => client;
    expect(await isBotInThread("om_root", "ou_bot")).toBe(false);
    expect(await isBotInThread("om_root", "ou_bot")).toBe(true);
    expect(getSpy).toHaveBeenCalledTimes(2);
  });
});
