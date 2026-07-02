import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { __routerDeps, routeMessageReceive } from "../src/feishu/event-router";
import type { FeishuMessageReceiveEvent } from "../src/feishu/types";

function makeEvent(opts: {
  senderType?: "user" | "app";
  chatType?: "p2p" | "group";
  mentionOpenIds?: string[];
  rootId?: string;
}): FeishuMessageReceiveEvent {
  const { senderType = "user", chatType = "p2p", mentionOpenIds, rootId } = opts;
  return {
    sender: {
      sender_id: { open_id: "ou_sender" },
      sender_type: senderType,
    },
    message: {
      message_id: "om_1",
      root_id: rootId,
      create_time: "1700000000000",
      chat_id: "oc_1",
      chat_type: chatType,
      message_type: "text",
      content: '{"text":"hi"}',
      mentions: mentionOpenIds?.map((id, i) => ({
        key: `@_user_${i}`,
        id: { open_id: id },
        name: `n${i}`,
      })),
    },
  };
}

const realResponder = __routerDeps.runFeishuResponder;
const realIsBotInThread = __routerDeps.isBotInThread;
let responderSpy: Mock<typeof __routerDeps.runFeishuResponder>;
let threadSpy: Mock<typeof __routerDeps.isBotInThread>;

beforeEach(() => {
  responderSpy = vi.fn<typeof __routerDeps.runFeishuResponder>(async () => ({
    handled: true,
    reason: "dispatch",
  }));
  __routerDeps.runFeishuResponder = responderSpy;
  threadSpy = vi.fn<typeof __routerDeps.isBotInThread>(async () => false);
  __routerDeps.isBotInThread = threadSpy;
});

afterEach(() => {
  __routerDeps.runFeishuResponder = realResponder;
  __routerDeps.isBotInThread = realIsBotInThread;
  delete process.env.FEISHU_BOT_OPEN_ID;
  vi.restoreAllMocks();
});

describe("routeMessageReceive — 总线卫生", () => {
  it("丢弃非 user 发送者（回环过滤），不调 responder", async () => {
    const res = await routeMessageReceive(makeEvent({ senderType: "app" }));
    expect(res).toEqual({ handled: false, reason: "non-user-sender:app" });
    expect(responderSpy).not.toHaveBeenCalled();
  });

  it("p2p 私聊直接放行，调 responder", async () => {
    const res = await routeMessageReceive(makeEvent({ chatType: "p2p" }));
    expect(responderSpy).toHaveBeenCalledOnce();
    expect(res).toEqual({ handled: true, reason: "dispatch" });
  });

  it("群聊缺 FEISHU_BOT_OPEN_ID 时拒绝转发", async () => {
    const res = await routeMessageReceive(makeEvent({ chatType: "group" }));
    expect(res).toEqual({ handled: false, reason: "missing-bot-open-id" });
    expect(responderSpy).not.toHaveBeenCalled();
  });

  it("群聊未 @ bot 且不在话题里（无 root_id）时不放行，也不查话题归属", async () => {
    process.env.FEISHU_BOT_OPEN_ID = "ou_bot";
    const res = await routeMessageReceive(
      makeEvent({ chatType: "group", mentionOpenIds: ["ou_other"] }),
    );
    expect(res).toEqual({ handled: false, reason: "group-without-mention" });
    expect(threadSpy).not.toHaveBeenCalled();
    expect(responderSpy).not.toHaveBeenCalled();
  });

  it("群聊 @ 了 bot 时放行，调 responder（无需查话题归属）", async () => {
    process.env.FEISHU_BOT_OPEN_ID = "ou_bot";
    const res = await routeMessageReceive(
      makeEvent({ chatType: "group", mentionOpenIds: ["ou_other", "ou_bot"] }),
    );
    expect(responderSpy).toHaveBeenCalledOnce();
    expect(threadSpy).not.toHaveBeenCalled();
    expect(res).toEqual({ handled: true, reason: "dispatch" });
  });
});

describe("routeMessageReceive — 话题多轮（thread 免 @）", () => {
  beforeEach(() => {
    process.env.FEISHU_BOT_OPEN_ID = "ou_bot";
  });

  it("bot 参与过的话题里未 @ 的回复放行（多轮追问入口）", async () => {
    threadSpy.mockResolvedValue(true);
    const res = await routeMessageReceive(makeEvent({ chatType: "group", rootId: "om_root" }));
    expect(threadSpy).toHaveBeenCalledWith("om_root", "ou_bot");
    expect(responderSpy).toHaveBeenCalledOnce();
    expect(res).toEqual({ handled: true, reason: "dispatch" });
  });

  it("成员自己开的话题（root 不归属 bot）未 @ 时仍丢弃", async () => {
    threadSpy.mockResolvedValue(false);
    const res = await routeMessageReceive(makeEvent({ chatType: "group", rootId: "om_root" }));
    expect(res).toEqual({ handled: false, reason: "group-thread-not-bot-involved" });
    expect(responderSpy).not.toHaveBeenCalled();
  });

  it("p2p 话题内回复不查归属，直接放行", async () => {
    const res = await routeMessageReceive(makeEvent({ chatType: "p2p", rootId: "om_root" }));
    expect(threadSpy).not.toHaveBeenCalled();
    expect(res).toEqual({ handled: true, reason: "dispatch" });
  });
});
