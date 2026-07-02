// Build and run @infra/bot in Docker.  `pnpm bot:up` / `pnpm bot:down`
//
// `up` (default): always rebuilds the image (so it runs the current code), then runs the
// container in the foreground (Ctrl-C stops it; --rm cleans up). The bot is a pure outbound
// long-connection service — no ports.
// `down`: stops the running container from another terminal (--rm then removes it).
//
// Config comes from apps/bot/.env via --env-file. The App private key needs to be
// INSIDE the container: if apps/bot/.env sets INFRA_LAB_BOT_PRIVATE_KEY_PATH to a host
// .pem, we bind-mount it read-only and override the path to the in-container location
// (a host path from .env is not visible inside the container otherwise). If instead you
// pass the key inline via INFRA_LAB_BOT_PRIVATE_KEY, no mount is needed.
//
// Slow / blocked npm registry (e.g. in China): set NPM_REGISTRY to a mirror, e.g.
//   NPM_REGISTRY=https://registry.npmmirror.com pnpm bot:up
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(repoRoot, "apps/bot/.env");
const IMAGE = "infra-bot";
const CONTAINER = "infra-bot";
const KEY_MOUNT_TARGET = "/run/secrets/bot-key.pem";

// `pnpm bot:down`：优雅停掉容器（SIGTERM；--rm 随后自动清理）。不需要 .env，所以在校验之前处理。
if (process.argv[2] === "down") {
  const status = docker(["stop", CONTAINER], { fatal: false });
  if (status !== 0) console.log(`ℹ 容器 ${CONTAINER} 不在运行，无需停止。`);
  process.exit(0);
}

if (!existsSync(envFile)) {
  console.error(`✗ 缺少 ${envFile}\n  先 cp apps/bot/.env.example apps/bot/.env 并填好凭证。`);
  process.exit(1);
}

/** 从 .env 里取某个 key 的值（极简解析：只认 `KEY=value`，去掉引号，不解析引用/多行）。 */
function readEnvValue(key) {
  for (const raw of readFileSync(envFile, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.startsWith(`${key}=`)) continue;
    return line
      .slice(key.length + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return "";
}

/** 跑一条 docker 子命令（继承 stdio）；失败即退出。返回给调用方判断也可以。 */
function docker(args, { fatal = true } = {}) {
  const r = spawnSync("docker", args, { cwd: repoRoot, stdio: "inherit" });
  if (r.error) {
    console.error(`✗ 执行 docker 失败：${r.error.message}（装了 Docker 且 daemon 在跑吗？）`);
    process.exit(1);
  }
  if (fatal && r.status !== 0) process.exit(r.status ?? 1);
  return r.status ?? 0;
}

// 1) Build（每次都构建，保证跑的是当前代码）。慢网可用 NPM_REGISTRY 换镜像源。
const buildArgs = ["build", "-f", "apps/bot/Dockerfile", "-t", IMAGE];
const registry = process.env.NPM_REGISTRY;
if (registry) buildArgs.push("--build-arg", `NPM_REGISTRY=${registry}`);
buildArgs.push(".");
console.log(`▶ docker build → ${IMAGE}${registry ? `（NPM_REGISTRY=${registry}）` : ""}`);
docker(buildArgs);

// 2) 清掉可能残留的同名容器（上次 Ctrl-C 没清干净等）。
docker(["rm", "-f", CONTAINER], { fatal: false });

// 3) Run。若 .env 用的是私钥文件路径，则把宿主机 .pem 挂进容器并覆盖路径。
const runArgs = ["run", "--rm", "--name", CONTAINER, "--env-file", "apps/bot/.env"];
const keyPath = readEnvValue("INFRA_LAB_BOT_PRIVATE_KEY_PATH");
if (keyPath) {
  if (existsSync(keyPath)) {
    runArgs.push("-v", `${keyPath}:${KEY_MOUNT_TARGET}:ro`);
    runArgs.push("-e", `INFRA_LAB_BOT_PRIVATE_KEY_PATH=${KEY_MOUNT_TARGET}`);
    console.log(`▶ 挂载 App 私钥：${keyPath} → ${KEY_MOUNT_TARGET}`);
  } else {
    console.warn(
      `⚠ INFRA_LAB_BOT_PRIVATE_KEY_PATH 指向的文件不存在：${keyPath}\n` +
        "  容器内将取不到 App 私钥，GitHub 派发会失败（除非配了静态 INFRA_LAB_BOT_GITHUB_TOKEN " +
        "或内联 INFRA_LAB_BOT_PRIVATE_KEY）。",
    );
  }
}
runArgs.push(IMAGE);
console.log(`▶ docker run ${CONTAINER}（Ctrl-C 停止）`);
process.exit(docker(runArgs, { fatal: false }));
