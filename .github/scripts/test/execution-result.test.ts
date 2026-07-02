import { describe, expect, it } from "vitest";

// @ts-expect-error 零依赖的 .mjs 脚本模块，无类型声明
import { extractResultText, isSwallowedResume, parseMessages } from "../execution-result.mjs";

describe("parseMessages", () => {
  it("解析 JSON 数组落盘格式", () => {
    const raw = JSON.stringify([{ type: "system" }, { type: "result", result: "ok" }]);
    expect(parseMessages(raw)).toHaveLength(2);
  });

  it("解析 JSONL 落盘格式，坏行与空行被丢弃", () => {
    const raw = '{"type":"system"}\n\nnot-json\n{"type":"result","result":"ok"}\n';
    const messages = parseMessages(raw);
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({ type: "result", result: "ok" });
  });

  it("单个 JSON 对象也包成数组", () => {
    expect(parseMessages('{"type":"result","result":"ok"}')).toHaveLength(1);
  });
});

describe("extractResultText", () => {
  it("优先取最后一条 result 消息的文本", () => {
    const messages = [
      { type: "assistant", message: { content: [{ type: "text", text: "中间回复" }] } },
      { type: "result", result: "最终结论" },
    ];
    expect(extractResultText(messages)).toBe("最终结论");
  });

  it("result 为空时兜底最后一条 assistant 文本", () => {
    const messages = [
      { type: "assistant", message: { content: [{ type: "text", text: "唯一回复" }] } },
      { type: "result", result: "" },
    ];
    expect(extractResultText(messages)).toBe("唯一回复");
  });

  it("什么都取不到时返回 null", () => {
    expect(extractResultText([{ type: "system" }])).toBeNull();
    expect(extractResultText([])).toBeNull();
  });
});

describe("isSwallowedResume", () => {
  // 实测特征来自 run 28591814073：--resume 时上一轮遗留的后台任务通知被 CLI 消费，
  // 随即 0 回合、空 result 退出，用户的新消息没有跑模型。
  const swallowed = [
    { type: "system", subtype: "task_notification", status: "stopped" },
    { type: "system", subtype: "init" },
    {
      type: "result",
      subtype: "success",
      is_error: false,
      num_turns: 0,
      result: "",
      origin: { kind: "task-notification" },
    },
  ];

  it("命中被吞 resume 的完整特征", () => {
    expect(isSwallowedResume(swallowed)).toBe(true);
  });

  it("正常运行（num_turns > 0、有文本）不误报", () => {
    const normal = [{ type: "result", subtype: "success", num_turns: 10, result: "结论" }];
    expect(isSwallowedResume(normal)).toBe(false);
  });

  it("0 回合但非 task-notification 起源（如早期报错）不误报", () => {
    const errored = [
      { type: "result", subtype: "error_during_execution", num_turns: 0, result: "" },
    ];
    expect(isSwallowedResume(errored)).toBe(false);
  });

  it("0 回合但带有文本结果不误报", () => {
    const withText = [
      { type: "result", num_turns: 0, result: "有话说", origin: { kind: "task-notification" } },
    ];
    expect(isSwallowedResume(withText)).toBe(false);
  });

  it("没有 result 消息 / 非数组输入不误报", () => {
    expect(isSwallowedResume([{ type: "system" }])).toBe(false);
    expect(isSwallowedResume(null)).toBe(false);
  });
});
