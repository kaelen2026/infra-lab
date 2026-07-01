import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { __routerDeps, routeMessageReceive } from "../src/feishu/event-router";
import type { FeishuMessageReceiveEvent } from "../src/feishu/types";

function makeEvent(opts: {
  senderType?: "user" | "app";
  chatType?: "p2p" | "group";
  mentionOpenIds?: string[];
}): FeishuMessageReceiveEvent {
  const { senderType = "user", chatType = "p2p", mentionOpenIds } = opts;
  return {
    sender: {
      sender_id: { open_id: "ou_sender" },
      sender_type: senderType,
    },
    message: {
      message_id: "om_1",
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
let responderSpy: Mock<typeof __routerDeps.runFeishuResponder>;

beforeEach(() => {
  responderSpy = vi.fn<typeof __routerDeps.runFeishuResponder>(async () => ({
    handled: true,
    reason: "dispatch",
  }));
  __routerDeps.runFeishuResponder = responderSpy;
});

afterEach(() => {
  __routerDeps.runFeishuResponder = realResponder;
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

  it("群聊未 @ bot 时不放行", async () => {
    process.env.FEISHU_BOT_OPEN_ID = "ou_bot";
    const res = await routeMessageReceive(
      makeEvent({ chatType: "group", mentionOpenIds: ["ou_other"] }),
    );
    expect(res).toEqual({ handled: false, reason: "group-without-mention" });
    expect(responderSpy).not.toHaveBeenCalled();
  });

  it("群聊 @ 了 bot 时放行，调 responder", async () => {
    process.env.FEISHU_BOT_OPEN_ID = "ou_bot";
    const res = await routeMessageReceive(
      makeEvent({ chatType: "group", mentionOpenIds: ["ou_other", "ou_bot"] }),
    );
    expect(responderSpy).toHaveBeenCalledOnce();
    expect(res).toEqual({ handled: true, reason: "dispatch" });
  });
});
