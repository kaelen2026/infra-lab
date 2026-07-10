import type { ResendEnvConfig } from "@infra/env/core";

/**
 * Minimal Resend (https://resend.com) transactional-email client.
 *
 * Transport is a single JSON POST to Resend's HTTP API over `fetch`, so — unlike the
 * APNS client (which needs `node:http2`) — this works unchanged on both the Node
 * runtime (`server.ts`) and the Cloudflare Worker (`worker.ts`). The `fetch` transport
 * is injectable so tests exercise the client without a socket (mirrors the APNS
 * `sender` seam in `apns-client.ts`).
 *
 * Secrets red line (see api-architecture / observability): the API key and the message
 * body are never logged; the OTP code lives only inside the message and never reaches
 * a log line.
 */

export type ResendConfig = ResendEnvConfig;

export const RESEND_SEND_URL = "https://api.resend.com/emails";

export interface EmailMessage {
  /** Single recipient address. */
  to: string;
  subject: string;
  /** HTML body. */
  html: string;
  /** Plain-text fallback body. */
  text: string;
}

export type EmailSendResult =
  | { ok: true; id?: string }
  | { ok: false; status: number; reason?: string };

export interface EmailSender {
  send(msg: EmailMessage): Promise<EmailSendResult>;
}

// ── Injectable transport (so the client is testable without a network call) ──────
export interface FetchResponseLike {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<FetchResponseLike>;

export interface ResendClientDeps {
  /** Test-only: replace the `fetch` transport. Defaults to the global `fetch`. */
  fetchImpl?: FetchLike;
}

export function createResendClient(config: ResendConfig, deps: ResendClientDeps = {}): EmailSender {
  const doFetch: FetchLike = deps.fetchImpl ?? ((url, init) => fetch(url, init));

  return {
    async send(msg) {
      const res = await doFetch(RESEND_SEND_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: config.from,
          to: msg.to,
          subject: msg.subject,
          html: msg.html,
          text: msg.text,
        }),
      });
      const body = await res.text();

      if (res.ok) {
        let id: string | undefined;
        try {
          id = (JSON.parse(body) as { id?: string }).id;
        } catch {
          // Non-JSON 2xx (unexpected); the send still succeeded.
        }
        return id ? { ok: true, id } : { ok: true };
      }

      let reason: string | undefined;
      try {
        // Resend error bodies are `{ name, message, statusCode }`.
        reason = (JSON.parse(body) as { message?: string }).message;
      } catch {
        // Non-JSON error body (rare); leave reason undefined.
      }
      return { ok: false, status: res.status, reason };
    },
  };
}
