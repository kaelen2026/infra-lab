import { parseArgs } from "node:util";
import type { TokenStore } from "@infra/sdk";
import { createCliClients } from "./client.js";
import { runLogin, runLogout, runWhoami } from "./commands/auth.js";
import { runTodoAdd, runTodoDone, runTodoList, runTodoRemove } from "./commands/todo.js";
import { runLoginWeb } from "./commands/web-login.js";
import {
  credentialsPath,
  DEFAULT_API_URL,
  deviceIdPath,
  type Env,
  resolveApiUrl,
} from "./config.js";
import { loadOrCreateDeviceId } from "./device.js";
import { formatError } from "./errors.js";
import { type CliIO, createStdioIO } from "./io.js";
import { openBrowser } from "./open-url.js";
import { createFileTokenStore } from "./token-store.js";

const VERSION = "0.1.0";

const OPTION_SPEC = {
  api: { type: "string" },
  web: { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
} as const;

const HELP = `infra-lab — 终端客户端 (手机号 + OTP 登录,复用本地会话)

用法:
  infra-lab auth login            交互式 OTP 登录 (login == register)
  infra-lab auth login --web      浏览器登录 (device flow:浏览器确认,复用登录态)
  infra-lab auth whoami           查看当前登录用户 (status 为其别名)
  infra-lab auth logout           退出登录并清除本地凭据
  infra-lab todo list             列出待办
  infra-lab todo add <标题...>     新建待办
  infra-lab todo done <id>        标记完成
  infra-lab todo rm <id>          删除待办

选项:
  --api <url>   覆盖 API 地址 (默认取 INFRA_LAB_API_URL,再退到 ${DEFAULT_API_URL})
  --web         auth login 走浏览器 device flow
  -h, --help    显示帮助
  -v, --version 显示版本

环境变量:
  INFRA_LAB_API_URL   API 基址
  XDG_CONFIG_HOME     凭据目录基址 (默认 ~/.config)`;

interface ParsedFlags {
  api?: string;
  web?: boolean;
  help?: boolean;
  version?: boolean;
}

/**
 * Parse argv and dispatch to a command. Pure over its injected {@link Env} and
 * {@link CliIO} so tests can drive it end-to-end; returns the process exit code.
 * The real `fetch`/stdio are used unless overridden (tests inject a fake fetch).
 */
export async function run(
  argv: string[],
  env: Env = process.env,
  io: CliIO = createStdioIO(),
  fetchImpl?: typeof fetch,
): Promise<number> {
  let values: ParsedFlags;
  let positionals: string[];
  try {
    const parsed = parseArgs({ args: argv, options: OPTION_SPEC, allowPositionals: true });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch (err) {
    io.error(formatError(err));
    return 2;
  }

  if (values.version) {
    io.print(VERSION);
    return 0;
  }
  const [group, command, ...rest] = positionals;
  if (values.help || group === undefined || group === "help") {
    io.print(HELP);
    // No command at all is a usage error; an explicit `help`/`--help` is success.
    return group === undefined && !values.help ? 1 : 0;
  }

  const override = values.api?.trim();
  const apiUrl = override ? override.replace(/\/+$/, "") : resolveApiUrl(env);
  const tokens = createFileTokenStore(credentialsPath(env));
  const { auth, todo } = createCliClients({ apiUrl, tokens, fetch: fetchImpl });

  try {
    return await dispatch({
      group,
      command,
      rest,
      auth,
      todo,
      io,
      env,
      apiUrl,
      tokens,
      web: values.web === true,
    });
  } catch (err) {
    io.error(formatError(err));
    return 1;
  }
}

interface DispatchCtx {
  group: string;
  command: string | undefined;
  rest: string[];
  auth: ReturnType<typeof createCliClients>["auth"];
  todo: ReturnType<typeof createCliClients>["todo"];
  io: CliIO;
  env: Env;
  apiUrl: string;
  tokens: TokenStore;
  web: boolean;
}

async function dispatch(ctx: DispatchCtx): Promise<number> {
  const { group, command, rest, auth, todo, io, env, apiUrl, tokens, web } = ctx;

  if (group === "auth") {
    const deviceId = await loadOrCreateDeviceId(deviceIdPath(env));
    const deps = { auth, io, deviceId };
    switch (command) {
      case "login":
        return web
          ? runLoginWeb({ apiUrl, tokens, io, deviceId, openUrl: openBrowser })
          : runLogin(deps);
      case "whoami":
      case "status": // alias for whoami
        return runWhoami(deps);
      case "logout":
        return runLogout(deps);
      default:
        io.error(`未知命令: auth ${command ?? ""}`.trim());
        return 2;
    }
  }

  if (group === "todo") {
    const deps = { auth, todo, io };
    switch (command) {
      case "list":
        return runTodoList(deps);
      case "add": {
        const title = rest.join(" ").trim();
        if (!title) {
          io.error("用法: infra-lab todo add <标题...>");
          return 2;
        }
        return runTodoAdd(deps, title);
      }
      case "done":
      case "rm": {
        const id = rest[0];
        if (!id) {
          io.error(`用法: infra-lab todo ${command} <id>`);
          return 2;
        }
        return command === "done" ? runTodoDone(deps, id) : runTodoRemove(deps, id);
      }
      default:
        io.error(`未知命令: todo ${command ?? ""}`.trim());
        return 2;
    }
  }

  io.error(`未知命令: ${group}`);
  return 2;
}

// Bootstrap: only when run as the binary, not when imported by tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      process.stderr.write(`${formatError(err)}\n`);
      process.exit(1);
    },
  );
}
