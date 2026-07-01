/**
 * 飞书事件长连接（WSClient + EventDispatcher）传入 handler 的 payload 类型。
 *
 * 长连接模式下 SDK 已剥掉外层 envelope，直接给到 event 部分；不再有 header.token / encrypt 等
 * webhook 才需要的字段。完整 schema 见
 * https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/event-subscription-guide/long-connection-mode
 */

export interface FeishuMessageReceiveEvent {
  sender: {
    sender_id: {
      union_id?: string;
      user_id?: string;
      open_id: string;
    };
    sender_type: "user" | "app";
    tenant_key?: string;
  };
  message: {
    message_id: string;
    root_id?: string;
    parent_id?: string;
    /**
     * 话题群里的话题 ID（omt_xxx）。在话题群中 @ bot 或回复 thread 内消息时存在，
     * 普通群的"非回复消息"为空。配合飞书 `im.v1.message.list` 的
     * `container_id_type='thread'` + `container_id=thread_id` 拉 thread 内消息。
     */
    thread_id?: string;
    create_time: string;
    chat_id: string;
    chat_type: "p2p" | "group";
    message_type:
      | "text"
      | "post"
      | "image"
      | "file"
      | "audio"
      | "media"
      | "sticker"
      | "interactive"
      | "share_chat"
      | "share_user"
      | (string & {});
    /** JSON 字符串，结构随 message_type 变化；text 类型为 `{"text": "..."}` */
    content: string;
    mentions?: Array<{
      key: string;
      id: { open_id: string; user_id?: string; union_id?: string };
      name: string;
      tenant_key?: string;
    }>;
  };
}
