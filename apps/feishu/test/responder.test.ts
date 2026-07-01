import { describe, expect, it, vi } from "vitest";
import {
  type RunFeishuResponderDeps,
  responderStepGate,
  runFeishuResponder,
} from "../src/feishu/responder/index";
import type { FeishuMessageReceiveEvent } from "../src/feishu/types";

function makeEvent(): FeishuMessageReceiveEvent {
  return {
    sender: { sender_id: { open_id: "ou_sender" }, sender_type: "user" },
    message: {
      message_id: "om_1",
      create_time: "1700000000000",
      chat_id: "oc_1",
      chat_type: "p2p",
      message_type: "text",
      content: '{"text":"hi"}',
    },
  };
}

function makeDeps(overrides: Partial<RunFeishuResponderDeps> = {}) {
  const react = vi.fn(async () => ({ ok: true }) as const);
  const reply = vi.fn(async () => ({ ok: true }));
  const dispatch = vi.fn(async () => ({ ok: true }));
  const deps: RunFeishuResponderDeps = {
    reactWithEmoji: react,
    replyMarkdown: reply,
    dispatchLocal: dispatch,
    ...overrides,
  };
  return { deps, react, reply, dispatch };
}

describe("responderStepGate", () => {
  it("第 0 步只放行并强制 react", () => {
    expect(responderStepGate(0)).toEqual({
      activeTools: ["react"],
      toolChoice: { type: "tool", toolName: "react" },
    });
  });

  it("第 1 步起只放行并强制 dispatch", () => {
    for (const step of [1, 2, 3]) {
      expect(responderStepGate(step)).toEqual({
        activeTools: ["dispatch"],
        toolChoice: { type: "tool", toolName: "dispatch" },
      });
    }
  });
});

describe("runFeishuResponder", () => {
  it("agent 正常先 react 再调 dispatch 工具：标记为已处理，不走兜底", async () => {
    const { deps, react, reply, dispatch } = makeDeps({
      // 模拟 agent：先调 react 工具，再调 dispatch 工具
      runAgent: async (tools) => {
        await tools.react.execute?.({ emoji_type: "OnIt" }, {} as never);
        await tools.dispatch.execute?.({ notice: "收到，稍等" }, {} as never);
      },
    });

    const res = await runFeishuResponder(makeEvent(), deps);

    expect(res).toEqual({ handled: true, reason: "dispatch" });
    expect(react).toHaveBeenCalledOnce();
    expect(react).toHaveBeenCalledWith("om_1", "OnIt");
    expect(reply).toHaveBeenCalledWith("om_1", "收到，稍等");
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it("agent 抛错：降级——补默认 react + 固定 notice + 派发", async () => {
    const { deps, react, reply, dispatch } = makeDeps({
      runAgent: async () => {
        throw new Error("llm down");
      },
    });

    const res = await runFeishuResponder(makeEvent(), deps);

    expect(res).toEqual({ handled: true, reason: "fallback-after-error" });
    expect(react).toHaveBeenCalledWith("om_1", "OnIt"); // 兜底默认 emoji
    expect(reply).toHaveBeenCalledWith("om_1", "收到，我看一下，稍等");
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it("agent 跑完但没调 dispatch：降级到本地派发", async () => {
    const { deps, dispatch } = makeDeps({
      runAgent: async () => {
        /* 什么都不做 */
      },
    });

    const res = await runFeishuResponder(makeEvent(), deps);
    expect(res).toEqual({ handled: true, reason: "fallback-empty" });
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it("agent 已 react 过、降级路径不重复 react（幂等）", async () => {
    const { deps, react } = makeDeps({
      runAgent: async (tools) => {
        await tools.react.execute?.({ emoji_type: "PARTY" }, {} as never);
        // 没有调 dispatch → 触发 fallback-empty
      },
    });

    await runFeishuResponder(makeEvent(), deps);
    // 只在 agent 步骤里 react 过一次；fallback 的 ensureReacted 是 no-op
    expect(react).toHaveBeenCalledOnce();
    expect(react).toHaveBeenCalledWith("om_1", "PARTY");
  });
});
