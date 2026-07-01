import { parseBotEnv } from "@infra/env/bot";
import type { LocalTaskHandler, RenderedTask } from "./feishu/dispatcher";
import { createAppTokenProviderFromEnv, type TokenProvider } from "./github-app-token";

/**
 * 把飞书接待链路的最后一步「派发到本仓库的 infra-lab-bot workflow」。
 *
 * dispatcher 已经把事件翻译成自然语言 `task` + `threadKey`，这里负责
 * 「拿 task → workflow_dispatch 触发 infra-lab-bot.yml」。
 *
 * 传两个输入：`prompt`（= 渲染好的 task，拼到 .github/prompts/infra-lab-bot.md 基础
 * 模板后交给 claude-code-action 跑）和 `feishu_message_id`（= 原消息 id）。workflow 跑完
 * 由 .github/scripts/feishu-reply.mjs 把结果回帖到同一飞书 thread，闭环。threadKey 仅用于
 * 日志。
 *
 * 鉴权：以 infra-lab-bot GitHub App 身份换取（并自动续期）installation token
 * （见 github-app-token）；配了静态 INFRA_LAB_BOT_GITHUB_TOKEN 则用它兜底。App 身份下
 * actor 是 Bot，workflow 里已 `allowed_bots: infra-lab-bot` 放行。
 *
 * 派发落点是 dispatcher 的 `LocalTaskHandler` 口子（index.ts 里
 * `setLocalTaskHandler(createBotDispatchHandler())` 装配）；要换本地 LLM / 队列 /
 * 别的远端，从这一个口子换即可。
 */

// 目标仓库 / ref 全部由环境变量配置（INFRA_LAB_BOT_GITHUB_REPO 必填、
// INFRA_LAB_BOT_GITHUB_REF 默认 main，默认值在 @infra/env/bot 里），不硬编码 owner/repo。
const BOT_WORKFLOW_FILE = "infra-lab-bot.yml";

/**
 * GitHub Actions workflow_dispatch 偶发 5xx 时的退避序列。
 * - 仅 5xx 走重试，4xx（不存在的 workflow / 非法 ref / 权限不足等）一律快速失败
 * - 序列长度即"额外尝试次数"，含初次共 3 次
 */
const DEFAULT_DISPATCH_BACKOFF_MS: readonly number[] = [500, 1500];
let dispatchBackoffMs: readonly number[] = DEFAULT_DISPATCH_BACKOFF_MS;

/** 仅供单元测试覆盖 backoff 序列（例如 [0, 0] 让"全部 5xx"测试跑得快）。返回恢复函数。 */
export function __setDispatchBackoffMsForTest(ms: readonly number[]): () => void {
  const prev = dispatchBackoffMs;
  dispatchBackoffMs = ms;
  return () => {
    dispatchBackoffMs = prev;
  };
}

/**
 * 构造一个把任务派发到 infra-lab-bot workflow 的 `LocalTaskHandler`。
 * 在 `index.ts` 里 `setLocalTaskHandler(createBotDispatchHandler())` 装配。
 * token provider 只建一次并被复用，从而跨消息共享 installation token 缓存 / 续期。
 */
export function createBotDispatchHandler(): LocalTaskHandler {
  const tokens = createAppTokenProviderFromEnv();
  return {
    async handle(t: RenderedTask): Promise<void> {
      // 传原消息 message_id 给 workflow：跑完后 feishu-reply 用它把结果回帖到同一 thread。
      const r = await dispatchBot(t.task, t.threadKey, t.event.message.message_id, { tokens });
      // handler 抛错 → dispatcher 的 dispatchLocal 兜底返回 ok:false 并记日志；
      // 安抚 notice 此前已发给用户，不会因派发失败而吞消息。
      if (!r.ok) {
        throw new Error(`infra-lab-bot dispatch failed status=${r.status} ${r.error ?? ""}`.trim());
      }
    },
  };
}

/** 全局 provider 单例：dispatchBot 未显式传入 tokens 时的默认来源（复用换发缓存）。 */
let defaultTokens: TokenProvider | null = null;
function getDefaultTokens(): TokenProvider {
  if (!defaultTokens) defaultTokens = createAppTokenProviderFromEnv();
  return defaultTokens;
}

export interface DispatchBotDeps {
  /** token 来源；默认用 App 换发的 provider（github-app-token）。仅测试需要注入。 */
  tokens?: TokenProvider;
}

/**
 * workflow_dispatch 触发 infra-lab-bot.yml。task 由 dispatcher 渲染好作为 `prompt`
 * 输入透传；messageId 作为 `feishu_message_id` 输入，让 workflow 跑完把结果回帖到
 * 同一飞书 thread（闭环）；threadKey 仅用于日志。
 */
export async function dispatchBot(
  task: string,
  threadKey: string,
  messageId: string,
  deps: DispatchBotDeps = {},
): Promise<{ ok: boolean; status: number; error?: string }> {
  // repo / ref 从 @infra/env/bot 读（ref 已默认 main）；token 走 App 换发 provider。
  const { INFRA_LAB_BOT_GITHUB_REPO: repo, INFRA_LAB_BOT_GITHUB_REF: ref } = parseBotEnv();
  if (!repo) {
    console.error("[feishu→bot] 缺少 INFRA_LAB_BOT_GITHUB_REPO，无法触发 workflow");
    return { ok: false, status: 0, error: "missing-github-repo" };
  }
  let token: string;
  try {
    token = await (deps.tokens ?? getDefaultTokens()).getToken();
  } catch (err) {
    console.error(`[feishu→bot] 取 GitHub token 失败：${err instanceof Error ? err.message : err}`);
    return { ok: false, status: 0, error: "token-error" };
  }

  const url = `https://api.github.com/repos/${repo}/actions/workflows/${BOT_WORKFLOW_FILE}/dispatches`;
  const body = JSON.stringify({
    ref,
    inputs: { prompt: task, feishu_message_id: messageId },
  });
  const ctx = { repo, ref, threadKey, taskLength: task.length };

  const maxAttempts = 1 + dispatchBackoffMs.length;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "infra-lab-feishu-bot",
      },
      body,
    });

    if (res.status === 204) {
      console.info(`[feishu→bot] dispatch ok ${formatDiag(ctx)}`);
      return { ok: true, status: res.status };
    }

    const responseBody = await res.text().catch(() => "<read-error>");
    const diag = {
      ...ctx,
      attempt,
      maxAttempts,
      status: res.status,
      requestId: res.headers.get("x-github-request-id") ?? "",
    };
    const diagStr = formatDiag(diag);
    const bodySnippet = responseBody.slice(0, 500);

    const is5xx = res.status >= 500 && res.status < 600;
    const willRetry = is5xx && attempt < maxAttempts;
    if (willRetry) {
      const delayMs = dispatchBackoffMs[attempt - 1] ?? 0;
      console.warn(
        `[feishu→bot] dispatch 5xx 准备重试 delayMs=${delayMs} body=${bodySnippet} ${diagStr}`,
      );
      await sleep(delayMs);
      continue;
    }

    console.error(`[feishu→bot] dispatch 失败 body=${bodySnippet} ${diagStr}`);
    return { ok: false, status: res.status, error: responseBody.slice(0, 200) };
  }

  // 类型层兜底：上面循环已穷尽所有 attempt，理论不可达。
  return { ok: false, status: 0, error: "unreachable" };
}

function formatDiag(diag: Record<string, string | number>): string {
  return Object.entries(diag)
    .filter(([, v]) => v !== "" && v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
