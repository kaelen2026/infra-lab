"use client";

import { COPY } from "@infra/design";
import { LEGAL_ROUTES, OTP_LIMITS } from "@infra/shared";
import { QrCode } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ModeToggle } from "@/components/mode-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRedirectIfAuthenticated, useSession } from "@/features/session";
import { CodeStep } from "./components/code-step";
import { PhoneStep } from "./components/phone-step";
import { useOtpLogin } from "./use-otp-login";

/** Orchestrates the OTP login flow: wires the headless hook to step views, then redirects home. */
export default function AuthPage() {
  const router = useRouter();
  const { refresh } = useSession();

  // Already signed in? Skip the login screen.
  useRedirectIfAuthenticated();

  const login = useOtpLogin({
    onAuthenticated: async () => {
      await refresh();
      router.replace("/");
    },
  });

  const title = login.step === "phone" ? "手机号登录" : "输入验证码";
  const description =
    login.step === "phone"
      ? "未注册的手机号将自动创建账号。"
      : `验证码已发送至 ${login.phone}，${OTP_LIMITS.ttlSeconds / 60} 分钟内有效。`;

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="absolute right-4 top-4">
        <ModeToggle />
      </div>

      <Card className="w-full max-w-[400px]">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2.5">
            <span className="size-2 rounded-full bg-primary" aria-hidden />
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              infra-lab
            </span>
          </div>
          <CardTitle className="font-serif text-2xl font-medium">{title}</CardTitle>
          <CardDescription className="leading-relaxed">{description}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {login.step === "phone" ? (
            <PhoneStep
              phone={login.phone}
              busy={login.busy}
              canSend={login.canSend}
              onPhoneChange={login.setPhone}
              onSend={login.sendCode}
            />
          ) : (
            <CodeStep
              code={login.code}
              busy={login.busy}
              cooldown={login.cooldown}
              canVerify={login.canVerify}
              canResend={login.canResend}
              onCodeChange={login.setCode}
              onVerify={login.verify}
              onResend={login.sendCode}
              onChangePhone={login.changePhone}
            />
          )}

          {login.error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            >
              {login.error}
            </p>
          )}

          {login.step === "phone" && (
            <Link
              href="/auth/qr"
              className="flex items-center justify-center gap-1.5 border-t pt-4 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              <QrCode className="size-4" />
              用已登录的 App 扫码登录
            </Link>
          )}

          <p className="border-t pt-4 text-center text-xs leading-relaxed text-muted-foreground">
            {COPY.legal.consentPrefix}
            <Link
              href={LEGAL_ROUTES.terms}
              className="text-foreground underline underline-offset-2"
            >
              {COPY.legal.termsLabel}
            </Link>
            {COPY.legal.and}
            <Link
              href={LEGAL_ROUTES.privacy}
              className="text-foreground underline underline-offset-2"
            >
              {COPY.legal.privacyLabel}
            </Link>
          </p>

          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            原生客户端（iOS / Android / HarmonyOS）将改用 Bearer accessToken + refreshToken。
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
