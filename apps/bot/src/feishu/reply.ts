import { getLarkClient } from "./lark-client";

/**
 * 用 bot 身份回复指定消息，默认开 `reply_in_thread`——回复落到话题流而不是群主聊天流。
 *
 * 为什么默认开 thread：群里 @ bot 的问答常常带大段调研结论 / 代码片段，直接发到主聊天流
 * 会刷屏打扰其它成员；落到 thread 后主聊天流只看到一条入口消息，展开才看完整问答。
 *
 * 走 interactive 卡片 + markdown 元素：飞书 `text` 消息只渲染纯文本（不解析
 * markdown 语法），要让 **粗体** / 列表 / 链接 / 代码块这些渲染出来，必须用
 * 卡片包一下。schema 2.0 最简卡片（无 header / title），看起来仍像普通对话气泡。
 *
 * 单纯的出站操作，不带任何业务判断（什么时候发、发什么内容由调用方决定）。
 */
export async function replyMarkdown(messageId: string, markdown: string): Promise<{ ok: boolean }> {
  const client = getLarkClient();
  if (!client) {
    console.error("[feishu] reply 失败：lark client 未初始化（缺 LARK_APP_*）");
    return { ok: false };
  }
  const card = {
    schema: "2.0",
    body: {
      elements: [{ tag: "markdown", content: markdown }],
    },
  };
  try {
    await client.im.v1.message.reply({
      path: { message_id: messageId },
      data: {
        msg_type: "interactive",
        content: JSON.stringify(card),
        reply_in_thread: true,
      },
    });
    return { ok: true };
  } catch (err) {
    console.error("[feishu] reply 失败", err);
    return { ok: false };
  }
}
