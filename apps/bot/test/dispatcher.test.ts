import { afterEach, describe, expect, it } from "vitest";
import {
  deriveThreadKey,
  dispatchLocal,
  type LocalTaskHandler,
  type RenderedTask,
  renderTask,
  resetLocalTaskHandler,
  setLocalTaskHandler,
} from "../src/feishu/dispatcher";
import type { FeishuMessageReceiveEvent } from "../src/feishu/types";

function makeEvent(
  overrides: Partial<FeishuMessageReceiveEvent["message"]> = {},
): FeishuMessageReceiveEvent {
  return {
    sender: {
      sender_id: { open_id: "ou_sender", user_id: "u_1" },
      sender_type: "user",
      tenant_key: "tk_1",
    },
    message: {
      message_id: "om_self",
      create_time: "1700000000000",
      chat_id: "oc_chat",
      chat_type: "group",
      message_type: "text",
      content: '{"text":"hello"}',
      ...overrides,
    },
  };
}

afterEach(() => {
  resetLocalTaskHandler();
});

describe("deriveThreadKey", () => {
  it("有 root_id 时落到 root_id", () => {
    const event = makeEvent({ root_id: "om_root", message_id: "om_self" });
    expect(deriveThreadKey(event)).toBe("om_root");
  });

  it("缺 root_id 时回落到自身 message_id", () => {
    const event = makeEvent({ root_id: undefined, message_id: "om_self" });
    expect(deriveThreadKey(event)).toBe("om_self");
  });
});

describe("renderTask", () => {
  it("带上关键元信息、原始 content 与 mentions", () => {
    const event = makeEvent({
      mentions: [
        {
          key: "@_user_1",
          id: { open_id: "ou_bot" },
          name: "bot",
        },
      ],
    });
    const task = renderTask(event);
    expect(task).toContain("chat_id: oc_chat");
    expect(task).toContain("message_id: om_self");
    expect(task).toContain('{"text":"hello"}');
    expect(task).toContain("mentions：");
    expect(task).toContain("open_id=ou_bot");
  });

  it("毫秒时间戳被格式化为 ISO", () => {
    const event = makeEvent({ create_time: "1700000000000" });
    expect(renderTask(event)).toContain(`create_time: ${new Date(1700000000000).toISOString()}`);
  });
});

describe("dispatchLocal", () => {
  it("把翻译后的 task 交给当前 handler，并返回 ok", async () => {
    const received: RenderedTask[] = [];
    const handler: LocalTaskHandler = {
      handle(t) {
        received.push(t);
      },
    };
    setLocalTaskHandler(handler);

    const event = makeEvent({ root_id: "om_root" });
    const res = await dispatchLocal(event);

    expect(res.ok).toBe(true);
    expect(received).toHaveLength(1);
    expect(received[0]?.threadKey).toBe("om_root");
    expect(received[0]?.task).toContain('{"text":"hello"}');
    expect(received[0]?.event).toBe(event);
  });

  it("handler 抛异常时返回 ok:false 且带 error，不冒泡", async () => {
    setLocalTaskHandler({
      handle() {
        throw new Error("boom");
      },
    });

    const res = await dispatchLocal(makeEvent());
    expect(res.ok).toBe(false);
    expect(res.error).toBe("boom");
  });
});
