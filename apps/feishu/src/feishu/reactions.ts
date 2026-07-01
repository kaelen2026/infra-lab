import { getLarkClient } from "./lark-client";

/**
 * fast-responder 允许选用的 reaction emoji 白名单。
 *
 * 飞书 messageReaction 的 emoji_type 由飞书自身维护一份「已知 ID」清单（取值
 * 区分大小写、混合 SCREAMING_SNAKE 和 PascalCase）。范围之外的字符串会被网关
 * 直接 400 拒绝（code 230002）。把白名单写在代码里有两个目的：
 *
 * 1. 经 `z.enum` 暴露给模型，使其只能选择已知可用的取值；
 * 2. 在出站到飞书之前做最后一道防御性校验，避免模型偶尔越界 / prompt 漂移
 *    引入新值时直接打到生产 ERROR。
 *
 * 清单源自 fast-responder prompt 中按场景列出的 emoji；新增 emoji 时需要在
 * prompt 与本数组同步增补，并确认飞书 API 接受。
 */
export const VALID_REACTION_EMOJIS = [
  // 收到 / 同意
  "OK",
  "THUMBSUP",
  "LGTM",
  "DONE",
  "Hundred",
  "CheckMark",
  // 致谢 / 鼓励
  "THANKS",
  "MUSCLE",
  "FINGERHEART",
  "APPLAUSE",
  "ROSE",
  "HEART",
  // 处理中
  "OnIt",
  "THINKING",
  "Typing",
  "OneSecond",
  "Alarm",
  // 否定 / 错误
  "CrossMark",
  "FACEPALM",
  "MinusOne",
  "ENOUGH",
  // 情绪 / 调侃
  "LAUGH",
  "WAVE",
  "WOW",
  "WITTY",
  "SHY",
  "SPEECHLESS",
  "Shrug",
  // 庆祝 / 称赞
  "PARTY",
  "Trophy",
  "Fire",
  "AWESOMEN",
  "LUCK",
  "YEAH",
  "PRAISE",
] as const;

export type ValidReactionEmoji = (typeof VALID_REACTION_EMOJIS)[number];

const VALID_REACTION_EMOJI_SET: ReadonlySet<string> = new Set(VALID_REACTION_EMOJIS);

export type ReactionFailureReason =
  | "lark_client_unavailable"
  | "unsupported_emoji"
  | "lark_rejected_emoji"
  | "lark_message_unsupported"
  | "lark_request_error"
  | "unexpected_error";

export type ReactionResult = { ok: true } | { ok: false; reason: ReactionFailureReason };

/**
 * 把脱敏后的 messageId（只保留前 8 后 4 + 总长度）用于结构化日志。
 * 出站 reaction 失败时不应把完整 messageId 打到日志里，避免反向定位用户聊天。
 */
function maskMessageId(messageId: string): string {
  if (!messageId) return "<empty>";
  if (messageId.length <= 12) return messageId;
  return `${messageId.slice(0, 8)}…${messageId.slice(-4)}(len=${messageId.length})`;
}

interface LarkErrorBody {
  code?: number;
  msg?: string;
  request_id?: string;
}

interface NormalizedLarkError {
  status?: number;
  code?: number;
  msg?: string;
  requestId?: string;
}

/**
 * 飞书 API 错误（不论是 Lark SDK 抛的 AxiosError 还是 fetch 错误）经过 SDK
 * 的 axios 拦截链路后会带上 response.data，里面是 `{ code, msg, request_id }`。
 * 用 duck typing 取值，避免直接依赖 axios 类型——SDK 内嵌 axios，业务侧没有
 * 把 axios 列在自己的 dependencies 里。
 */
function normalizeLarkError(err: unknown): NormalizedLarkError {
  if (!err || typeof err !== "object") return {};
  const anyErr = err as {
    response?: { status?: number; data?: LarkErrorBody };
  };
  const response = anyErr.response;
  if (!response) return {};
  const data = response.data ?? {};
  return {
    status: response.status,
    code: data.code,
    msg: data.msg,
    requestId: data.request_id,
  };
}

/**
 * 已知可预期的 400 类错误：模型选了一个飞书不认的 emoji，或者目标消息不在
 * 支持 reaction 的状态（撤回、超出时限、消息类型不允许）。这类失败属于工具
 * 调用方的输入问题，不应反复污染 production ERROR。
 *
 * 飞书 messageReaction 错误码取自官方文档与历史踩坑：
 * - 230002 / 231001：emoji_type 非法（飞书线上集合会变动，本地白名单可能漂移，
 *   把两种错误码都收口为 warn，避免下次又有变体值打到 production ERROR）
 * - 230020：消息类型不支持 reaction
 */
const KNOWN_EMOJI_REJECT_CODES = new Set<number>([230002, 231001]);
const KNOWN_MESSAGE_UNSUPPORTED_CODES = new Set<number>([230020]);

/**
 * 给消息打 reaction。emoji_type 必须落在 `VALID_REACTION_EMOJIS` 白名单内；
 * 不在白名单的入参直接被本地拒绝（warn 级日志，不再触发出站），避免飞书
 * 网关返回 400 反复污染 production ERROR。
 *
 * 单纯的出站操作，业务语义（什么时候打 / 打哪个）由调用方决定。
 */
export async function reactWithEmoji(
  messageId: string,
  emojiType: string,
): Promise<ReactionResult> {
  if (!VALID_REACTION_EMOJI_SET.has(emojiType)) {
    console.warn(
      "[feishu] reaction 跳过：emoji_type 不在白名单",
      JSON.stringify({
        messageId: maskMessageId(messageId),
        emojiType,
        reason: "unsupported_emoji",
      }),
    );
    return { ok: false, reason: "unsupported_emoji" };
  }
  const client = getLarkClient();
  if (!client) {
    console.error("[feishu] reaction 失败：lark client 未初始化");
    return { ok: false, reason: "lark_client_unavailable" };
  }
  try {
    await client.im.v1.messageReaction.create({
      path: { message_id: messageId },
      data: { reaction_type: { emoji_type: emojiType } },
    });
    return { ok: true };
  } catch (err) {
    const info = normalizeLarkError(err);
    const fallbackMessage = err instanceof Error ? err.message : String(err);
    const payload = JSON.stringify({
      messageId: maskMessageId(messageId),
      emojiType,
      status: info.status,
      larkCode: info.code,
      larkMsg: info.msg,
      requestId: info.requestId,
      err: info.status ? undefined : fallbackMessage,
    });

    if (info.code && KNOWN_EMOJI_REJECT_CODES.has(info.code)) {
      console.warn("[feishu] reaction 被飞书拒绝（非法 emoji_type）", payload);
      return { ok: false, reason: "lark_rejected_emoji" };
    }
    if (info.code && KNOWN_MESSAGE_UNSUPPORTED_CODES.has(info.code)) {
      console.warn("[feishu] reaction 被飞书拒绝（消息不支持）", payload);
      return { ok: false, reason: "lark_message_unsupported" };
    }
    if (info.status && info.status >= 400 && info.status < 500) {
      // 其它 4xx（权限 / 认证 / 配额）仍保留 ERROR 追踪，但带上结构化诊断
      console.error("[feishu] reaction 失败（飞书 4xx）", payload);
      return { ok: false, reason: "lark_request_error" };
    }
    console.error("[feishu] reaction 失败", payload);
    return { ok: false, reason: "unexpected_error" };
  }
}
