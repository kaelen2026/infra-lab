import { OTP_LIMITS } from "@infra/shared";
import type { EmailMessage } from "./resend-client.js";

/**
 * Build the OTP verification email for the email-login flow. Kept separate from the
 * generic {@link EmailMessage} sender (resend-client) so the message copy lives in one
 * place, shared by both entrypoints (server.ts / worker.ts).
 *
 * The plaintext code is embedded in the body and MUST NOT be logged (see the secrets
 * red line). The template is intentionally minimal — text + a small HTML variant.
 */

const TTL_MINUTES = Math.round(OTP_LIMITS.ttlSeconds / 60);

const escapeHtml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch,
  );

export function buildOtpEmail(to: string, code: string): EmailMessage {
  const safeCode = escapeHtml(code);
  return {
    to,
    subject: `你的验证码 ${code} / Your verification code`,
    text:
      `你的验证码是 ${code},${TTL_MINUTES} 分钟内有效。\n` +
      `如果不是你本人操作,请忽略本邮件。\n\n` +
      `Your verification code is ${code}. It expires in ${TTL_MINUTES} minutes.\n` +
      `If you didn't request this, you can safely ignore this email.`,
    html:
      `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6">` +
      `<p>你的验证码是 / Your verification code:</p>` +
      `<p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:12px 0">${safeCode}</p>` +
      `<p style="color:#666">${TTL_MINUTES} 分钟内有效。如果不是你本人操作,请忽略本邮件。<br>` +
      `Expires in ${TTL_MINUTES} minutes. If you didn't request this, ignore this email.</p>` +
      `</div>`,
  };
}
