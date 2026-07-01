import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { type FeishuEnv, parseFeishuEnv } from "@infra/env/feishu";

/**
 * infra-lab-bot GitHub App 的 token provider：用 App 私钥自己签 JWT → 换 installation
 * token，进程内缓存并在到期前自动续期。派发 workflow_dispatch 时以 App 身份鉴权
 * （actor = infra-lab-bot[bot]），不依赖个人 PAT，也不用手动塞会过期的静态 token。
 *
 * 优先级：配了静态 `staticToken`（INFRA_LAB_BOT_GITHUB_TOKEN）就直接用它（兜底 / 本地
 * 快测）；否则用 clientId + privateKey 走 App 换发。
 */

export interface AppTokenProviderConfig {
  /** INFRA_LAB_BOT_GITHUB_TOKEN：配了就直接用，跳过 App 换发（兜底 / 测试）。 */
  staticToken?: string;
  /** INFRA_LAB_BOT_CLIENT_ID：App 的 Client ID，作 JWT 的 iss（GitHub 已弃用 App ID）。 */
  clientId?: string;
  /** App 私钥 PEM 内容（已从 inline env 或文件解析好）。 */
  privateKey?: string;
  /** 安装该 App 的账号（owner），用于在 installations 里定位。 */
  owner: string;
  /** 目标仓库名，用于把 installation token 的权限 scope 到单仓。 */
  repo: string;
}

export interface AppTokenProviderDeps {
  /** 仅供测试注入；生产用全局 fetch。 */
  fetchImpl?: typeof fetch;
  /** 仅供测试注入当前时间（ms）；生产用 Date.now。 */
  now?: () => number;
  /** 仅供测试注入 JWT 签名；生产用 defaultSignJwt。 */
  signJwt?: (clientId: string, privateKey: string, nowSec: number) => string;
}

export interface TokenProvider {
  getToken(): Promise<string>;
}

/** installation token 有效期约 1 小时；到期前这个缓冲窗口内提前续期，避免踩点失效。 */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

const b64url = (s: string | Buffer): string => Buffer.from(s).toString("base64url");

/** 用 App 私钥签一个短时 JWT（RS256，iss=clientId），用于换 installation token。 */
export function defaultSignJwt(clientId: string, privateKey: string, nowSec: number): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  // iat 回拨 60s 容忍时钟偏差；exp 取 9 分钟（GitHub 上限 10 分钟）。
  const payload = b64url(JSON.stringify({ iat: nowSec - 60, exp: nowSec + 540, iss: clientId }));
  const input = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(input);
  signer.end();
  return `${input}.${b64url(signer.sign(privateKey))}`;
}

export function createAppTokenProvider(
  cfg: AppTokenProviderConfig,
  deps: AppTokenProviderDeps = {},
): TokenProvider {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const signJwt = deps.signJwt ?? defaultSignJwt;
  let cache: { token: string; expiresAtMs: number } | null = null;

  const gh = (path: string, init: RequestInit = {}): Promise<Response> =>
    fetchImpl(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "infra-lab-feishu-bot",
        ...(init.headers ?? {}),
      },
    });

  async function mint(): Promise<{ token: string; expiresAtMs: number }> {
    if (!cfg.clientId || !cfg.privateKey) {
      throw new Error(
        "缺少 App 凭证（INFRA_LAB_BOT_CLIENT_ID + 私钥）且未配静态 INFRA_LAB_BOT_GITHUB_TOKEN",
      );
    }
    const jwt = signJwt(cfg.clientId, cfg.privateKey, Math.floor(now() / 1000));
    const auth = { Authorization: `Bearer ${jwt}` };

    const instRes = await gh("/app/installations", { headers: auth });
    if (!instRes.ok) {
      throw new Error(`列 installations 失败 status=${instRes.status}`);
    }
    const insts: unknown = await instRes.json();
    const inst = Array.isArray(insts)
      ? insts.find((i) => i?.account?.login?.toLowerCase?.() === cfg.owner.toLowerCase())
      : undefined;
    if (!inst?.id) {
      throw new Error(`未找到 ${cfg.owner} 的 App installation`);
    }

    const tokRes = await gh(`/app/installations/${inst.id}/access_tokens`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        repositories: [cfg.repo],
        permissions: { actions: "write", metadata: "read" },
      }),
    });
    const tok = (await tokRes.json()) as {
      token?: string;
      expires_at?: string;
      message?: string;
    };
    if (!tokRes.ok || !tok.token) {
      throw new Error(
        `换 installation token 失败 status=${tokRes.status} ${tok.message ?? ""}`.trim(),
      );
    }
    const expiresAtMs = tok.expires_at ? Date.parse(tok.expires_at) : now() + 60 * 60 * 1000;
    return { token: tok.token, expiresAtMs };
  }

  return {
    async getToken(): Promise<string> {
      if (cfg.staticToken) return cfg.staticToken;
      if (cache && now() < cache.expiresAtMs - REFRESH_BUFFER_MS) return cache.token;
      cache = await mint();
      return cache.token;
    },
  };
}

/**
 * 解析 App 私钥 PEM：优先 inline（INFRA_LAB_BOT_PRIVATE_KEY，支持 `\n` 转义），否则读
 * 文件（INFRA_LAB_BOT_PRIVATE_KEY_PATH）。都没有则返回 undefined。值来自 @infra/env 的
 * feishu bucket（已 trim 空串为 undefined）。
 */
export function resolvePrivateKey(env: FeishuEnv): string | undefined {
  const inline = env.INFRA_LAB_BOT_PRIVATE_KEY;
  if (inline) return inline.includes("\\n") ? inline.replace(/\\n/g, "\n") : inline;
  const path = env.INFRA_LAB_BOT_PRIVATE_KEY_PATH;
  if (path) {
    try {
      return readFileSync(path, "utf8");
    } catch (err) {
      console.error(
        `[feishu→bot] 读取私钥失败 path=${path}: ${err instanceof Error ? err.message : err}`,
      );
      return undefined;
    }
  }
  return undefined;
}

/** 用 @infra/env 的 feishu bucket 构造一个 provider（repo = owner/name）。 */
export function createAppTokenProviderFromEnv(): TokenProvider {
  const env = parseFeishuEnv();
  const [owner, name] = (env.INFRA_LAB_BOT_GITHUB_REPO ?? "").split("/");
  return createAppTokenProvider({
    staticToken: env.INFRA_LAB_BOT_GITHUB_TOKEN,
    clientId: env.INFRA_LAB_BOT_CLIENT_ID,
    privateKey: resolvePrivateKey(env),
    owner: owner ?? "",
    repo: name ?? "",
  });
}
