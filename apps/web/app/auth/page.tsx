"use client";

import { AUTH_ROUTES, type AuthErrorCode, OTP_LIMITS } from "@infra/shared";
import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  INVALID_REQUEST: "手机号或验证码格式不正确。",
  RESEND_COOLDOWN: "发送过于频繁，请稍后再试。",
  DAILY_LIMIT_EXCEEDED: "今日验证码发送次数已达上限。",
  IP_LIMIT_EXCEEDED: "当前网络发送过于频繁，请稍后再试。",
  LOCKED: "尝试次数过多，账号已被临时锁定，请 10 分钟后重试。",
  CODE_EXPIRED: "验证码已过期，请重新获取。",
  INVALID_CODE: "验证码错误。",
  UNAUTHORIZED: "登录状态已失效，请重新登录。",
  INVALID_REFRESH_TOKEN: "登录状态已失效，请重新登录。",
};

type Step = "phone" | "code" | "done";

interface ApiError {
  code: AuthErrorCode;
  retryAfter?: number;
  remainingAttempts?: number;
}

async function call<T>(
  path: string,
  body: unknown,
): Promise<{ ok: true; data: T } | { ok: false; error: ApiError }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // Web auth uses the HttpOnly session cookie — must include credentials.
    credentials: "include",
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: json as ApiError };
  return { ok: true, data: json as T };
}

export default function AuthPage() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("+86");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function describe(err: ApiError): string {
    const base = ERROR_MESSAGES[err.code] ?? "出错了，请稍后再试。";
    if (err.code === "INVALID_CODE" && typeof err.remainingAttempts === "number") {
      return `${base}还可尝试 ${err.remainingAttempts} 次。`;
    }
    return base;
  }

  async function sendCode() {
    setError(null);
    setBusy(true);
    const res = await call<{ resendAfterSeconds: number }>(AUTH_ROUTES.requestOtp, {
      phone,
      platform: "web",
    });
    setBusy(false);
    if (!res.ok) return setError(describe(res.error));
    setCooldown(res.data.resendAfterSeconds ?? OTP_LIMITS.resendCooldownSeconds);
    setStep("code");
  }

  async function verify() {
    setError(null);
    setBusy(true);
    const res = await call<{ user: { displayName: string | null; phone: string } }>(
      AUTH_ROUTES.verifyOtp,
      {
        phone,
        code,
        platform: "web",
      },
    );
    setBusy(false);
    if (!res.ok) return setError(describe(res.error));
    setDisplayName(res.data.user.displayName ?? res.data.user.phone);
    setStep("done");
  }

  return (
    <main className="shell">
      <section className="card">
        <div className="brand">
          <i className="dot" />
          <span>infra-lab</span>
        </div>

        {step === "phone" && (
          <>
            <h1>手机号登录</h1>
            <p className="sub">未注册的手机号将自动创建账号。</p>
            <label htmlFor="phone">手机号</label>
            <input
              id="phone"
              className="input"
              inputMode="tel"
              placeholder="+8613800138000"
              value={phone}
              onChange={(e) => setPhone(e.target.value.trim())}
              autoFocus
            />
            <button
              type="button"
              className="btn"
              disabled={busy || phone.replace(/\D/g, "").length < 8}
              onClick={sendCode}
            >
              {busy ? "发送中…" : "获取验证码"}
            </button>
          </>
        )}

        {step === "code" && (
          <>
            <h1>输入验证码</h1>
            <p className="sub">
              验证码已发送至 {phone}，{OTP_LIMITS.ttlSeconds / 60} 分钟内有效。
            </p>
            <label htmlFor="code">6 位验证码</label>
            <input
              id="code"
              className="input code"
              inputMode="numeric"
              maxLength={OTP_LIMITS.codeLength}
              placeholder="••••••"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, OTP_LIMITS.codeLength))
              }
              autoFocus
            />
            <button
              type="button"
              className="btn"
              disabled={busy || code.length !== OTP_LIMITS.codeLength}
              onClick={verify}
            >
              {busy ? "验证中…" : "登录 / 注册"}
            </button>
            <div className="row">
              <button type="button" className="linkbtn" onClick={() => setStep("phone")}>
                ‹ 更换手机号
              </button>
              <button
                type="button"
                className="linkbtn"
                disabled={cooldown > 0 || busy}
                onClick={sendCode}
              >
                {cooldown > 0 ? `${cooldown}s 后重新发送` : "重新发送"}
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <>
            <h1>登录成功</h1>
            <p className="sub">欢迎，{displayName}。</p>
            <div className="alert ok">
              会话已写入 HttpOnly Cookie，后续请求将自动携带，无需在前端保存任何 Token。
            </div>
          </>
        )}

        {error && <div className="alert error">{error}</div>}

        {step !== "done" && (
          <p className="hint">
            原生客户端（iOS / Android / HarmonyOS）将改用 Bearer accessToken + refreshToken。
          </p>
        )}
      </section>
    </main>
  );
}
