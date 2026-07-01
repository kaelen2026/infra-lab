import { parseFeishuEnv } from "@infra/env/feishu";
import type { LocalTaskHandler, RenderedTask } from "./feishu/dispatcher";

/**
 * 把飞书接待链路的最后一步「派发到本仓库的 infra-lab-bot workflow」。
 *
 * dispatcher 已经把事件翻译成自然语言 `task` + `threadKey`，这里只负责
 * 「拿 task → workflow_dispatch 触发 infra-lab-bot.yml」。
 *
 * 注意 infra-lab-bot.yml 的 workflow_dispatch **只接受一个 `prompt` 输入**
 * （见 .github/workflows/infra-lab-bot.yml）。它把 `prompt` 拼到
 * .github/prompts/infra-lab-bot.md 的基础模板后面，交给 claude-code-action 跑，
 * 输出落到 Actions run 日志——**目前不会回帖到飞书 thread**。要闭环（bot 把结果
 * 回到发起消息的飞书 thread）需要另外扩展该 workflow（加 LARK secrets + 回帖步骤），
 * 属独立后续项。threadKey 此处仅用于日志定位，不作为 workflow 输入透传
 * （多传未声明的输入 GitHub 会以 422 拒绝）。
 *
 * 派发落点是 dispatcher 的 `LocalTaskHandler` 口子（index.ts 里
 * `setLocalTaskHandler(createBotDispatchHandler())` 装配）；要换本地 LLM / 队列 /
 * 别的远端，从这一个口子换即可。
 */

// 目标仓库 / ref 全部由环境变量配置（INFRA_LAB_BOT_GITHUB_REPO 必填、
// INFRA_LAB_BOT_GITHUB_REF 默认 main，默认值在 @infra/env/feishu 里），不硬编码 owner/repo。
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
 */
export function createBotDispatchHandler(): LocalTaskHandler {
  return {
    async handle(t: RenderedTask): Promise<void> {
      // 传原消息 message_id 给 workflow：跑完后 feishu-reply 用它把结果回帖到同一 thread。
      const r = await dispatchBot(t.task, t.threadKey, t.event.message.message_id);
      // handler 抛错 → dispatcher 的 dispatchLocal 兜底返回 ok:false 并记日志；
      // 安抚 notice 此前已发给用户，不会因派发失败而吞消息。
      if (!r.ok) {
        throw new Error(`infra-lab-bot dispatch failed status=${r.status} ${r.error ?? ""}`.trim());
      }
    },
  };
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
): Promise<{ ok: boolean; status: number; error?: string }> {
  const {
    INFRA_LAB_BOT_GITHUB_TOKEN: token,
    INFRA_LAB_BOT_GITHUB_REPO: repo,
    INFRA_LAB_BOT_GITHUB_REF: ref,
  } = parseFeishuEnv();
  if (!token) {
    console.error("[feishu→bot] 缺少 INFRA_LAB_BOT_GITHUB_TOKEN，无法触发 workflow");
    return { ok: false, status: 0, error: "missing-github-token" };
  }
  if (!repo) {
    console.error("[feishu→bot] 缺少 INFRA_LAB_BOT_GITHUB_REPO，无法触发 workflow");
    return { ok: false, status: 0, error: "missing-github-repo" };
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
