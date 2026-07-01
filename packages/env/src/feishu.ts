// Feishu bucket: the bot's Lark / GitHub-dispatch / LLM credentials.
//
// UNLIKE the core bucket, this is graceful-degradation, not fail-fast. The bot
// intentionally runs in a reduced mode when a credential is absent — it skips the
// ws client without LARK_APP_ID/SECRET, returns a null Lark client, degrades the
// LLM responder to a fixed notice, and refuses group messages without a bot
// open-id. So parsing NEVER throws: every field is optional, normalized into
// typed optionals + defaults.
//
// Read live on each use via parseFeishuEnv (NOT memoized): the router reads
// FEISHU_BOT_OPEN_ID per message and tests toggle env vars between cases.
//
// NEVER log a parsed value — these are app secrets.

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

// An empty string (`KEY=` in a .env) is treated the same as unset.
const optional = z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).optional());

const FeishuEnvSchema = z.object({
  // Lark app auth (inbound ws + outbound API share these).
  LARK_APP_ID: optional,
  LARK_APP_SECRET: optional,
  // Only the exact string "Lark" selects the international domain; anything else
  // (including unset) means the China "Feishu" domain — matching the prior
  // `=== "Lark" ? Lark : Feishu` checks at every call site.
  LARK_DOMAIN: z.preprocess((v) => (v === "Lark" ? "Lark" : "Feishu"), z.enum(["Feishu", "Lark"])),
  // Bot open-id used to detect an @-mention in group chats.
  FEISHU_BOT_OPEN_ID: optional,
  // workflow_dispatch target for infra-lab-bot.yml. REF defaults to "main".
  INFRA_LAB_BOT_GITHUB_REPO: optional,
  INFRA_LAB_BOT_GITHUB_REF: optional.pipe(z.string().default("main")),
  // Dispatch auth. Method A (preferred): mint an installation token from the
  // infra-lab-bot App — CLIENT_ID + private key (inline PEM, or a path to a .pem).
  // Method B (fallback): a static token that short-circuits the App mint.
  INFRA_LAB_BOT_CLIENT_ID: optional,
  INFRA_LAB_BOT_PRIVATE_KEY: optional,
  INFRA_LAB_BOT_PRIVATE_KEY_PATH: optional,
  INFRA_LAB_BOT_GITHUB_TOKEN: optional,
  // Fast-responder LLM (OpenAI-compatible). All three required together to run;
  // any missing → the responder degrades. Enforced at the call site, not here.
  LLM_BASE_URL: optional,
  LLM_API_KEY: optional,
  LLM_MODEL: optional,
});

export type FeishuEnv = z.infer<typeof FeishuEnvSchema>;

/**
 * Parse a raw env bag into a typed {@link FeishuEnv}. Pure, side-effect free and
 * cannot throw (every field is optional / defaulted). Call it fresh at each use —
 * it reads the current `process.env` by default, which the per-message router and
 * the tests rely on. {@link loadFeishuEnv} wires in the .env file at startup.
 */
export function parseFeishuEnv(
  source: Record<string, string | undefined> = process.env,
): FeishuEnv {
  return FeishuEnvSchema.parse(source);
}

// The bot runs from apps/feishu, so its .env sits in the current directory. In
// production the platform injects real env vars and no file is present — loading is
// then a no-op. Existing process.env values are not overwritten by the file.
function loadFeishuEnvFile(): void {
  const candidate = resolve(process.cwd(), ".env");
  if (existsSync(candidate)) process.loadEnvFile(candidate);
}

/**
 * Load the bot's `.env` (if present) then parse. Call once at an entrypoint
 * (`index.ts`, scripts) to populate `process.env`; runtime code then reads live
 * via {@link parseFeishuEnv}.
 */
export function loadFeishuEnv(): FeishuEnv {
  loadFeishuEnvFile();
  return parseFeishuEnv(process.env);
}
