import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { parseBotEnv } from "@infra/env/bot";
import type { LanguageModel } from "ai";

let cached: LanguageModel | null | undefined;

/**
 * 接待 agent 用的 LLM provider：走自定义网关 / 任意 OpenAI-compatible 端点。
 * 用 LLM_BASE_URL + LLM_API_KEY + LLM_MODEL 三个 env 配置；缺任一返回 null，
 * 让 responder 自己降级（固定 notice + 直接派发，链路仍走通）。
 *
 * 单例缓存：避免每条消息重建 provider。
 */
export function getResponderModel(): LanguageModel | null {
  if (cached !== undefined) return cached;
  const { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL } = parseBotEnv();
  if (!LLM_BASE_URL || !LLM_API_KEY || !LLM_MODEL) {
    cached = null;
    return null;
  }
  const provider = createOpenAICompatible({
    name: "feishu-bot-gateway",
    baseURL: LLM_BASE_URL,
    apiKey: LLM_API_KEY,
  });
  cached = provider(LLM_MODEL);
  return cached;
}
