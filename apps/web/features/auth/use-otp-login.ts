"use client";

import { OTP_LIMITS } from "@infra/shared";
import { useCallback, useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { describeError } from "@/lib/errors";

export type Step = "phone" | "code";

export interface UseOtpLoginOptions {
  /** Called once verification succeeds. The page refreshes the session and redirects here. */
  onAuthenticated: () => void | Promise<void>;
}

/** Headless OTP login flow: owns all state, SDK calls, and input normalization. */
export interface OtpLogin {
  step: Step;
  phone: string;
  code: string;
  busy: boolean;
  error: string | null;
  /** Seconds left before the code may be resent (0 ⇒ allowed). */
  cooldown: number;
  /** Whether the current phone/code is well-formed enough to submit. */
  canSend: boolean;
  canVerify: boolean;
  canResend: boolean;
  setPhone: (value: string) => void;
  setCode: (value: string) => void;
  sendCode: () => void;
  verify: () => void;
  changePhone: () => void;
}

/**
 * The auth page's business logic, free of any markup. Returns a view-model the
 * UI renders directly — so the flow can be tested or reused without a DOM.
 */
export function useOtpLogin({ onAuthenticated }: UseOtpLoginOptions): OtpLogin {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhoneState] = useState("+86");
  const [code, setCodeState] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Resend-cooldown ticker.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Normalize input at the edge so the view stays dumb.
  const setPhone = useCallback((value: string) => setPhoneState(value.trim()), []);
  const setCode = useCallback(
    (value: string) => setCodeState(value.replace(/\D/g, "").slice(0, OTP_LIMITS.codeLength)),
    [],
  );

  const sendCode = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await authClient.requestOtp({ phone, platform: "web" });
      setCooldown(res.resendAfterSeconds ?? OTP_LIMITS.resendCooldownSeconds);
      setStep("code");
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }, [phone]);

  const verify = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await authClient.verifyOtp({ phone, code, platform: "web" });
      await onAuthenticated();
      // Stay busy through the redirect so buttons don't flash re-enabled.
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }, [phone, code, onAuthenticated]);

  const changePhone = useCallback(() => {
    setError(null);
    setCode("");
    setStep("phone");
  }, [setCode]);

  return {
    step,
    phone,
    code,
    busy,
    error,
    cooldown,
    canSend: phone.replace(/\D/g, "").length >= 8,
    canVerify: code.length === OTP_LIMITS.codeLength,
    canResend: cooldown <= 0,
    setPhone,
    setCode,
    sendCode,
    verify,
    changePhone,
  };
}
