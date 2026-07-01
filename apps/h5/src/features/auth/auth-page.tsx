import { COPY } from "@infra/design";
import { OTP_LIMITS } from "@infra/shared";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { ThemeToggle } from "@/components/theme-toggle";
import { useSession } from "@/features/session";
import { CodeStep } from "./components/code-step";
import { PhoneStep } from "./components/phone-step";
import { useOtpLogin } from "./use-otp-login";

/** Mobile-first OTP login: wires the headless hook to the step views, then redirects home. */
export function AuthPage() {
  const navigate = useNavigate();
  const { status, refresh } = useSession();

  // Already signed in? Skip the login screen.
  useEffect(() => {
    if (status === "authenticated") navigate("/", { replace: true });
  }, [status, navigate]);

  const login = useOtpLogin({
    onAuthenticated: async () => {
      await refresh();
      navigate("/", { replace: true });
    },
  });

  const title = login.step === "phone" ? COPY.phone.title : COPY.code.title;
  const description =
    login.step === "phone"
      ? COPY.phone.description
      : COPY.code.description
          .replace("{phone}", login.phone)
          .replace("{minutes}", String(OTP_LIMITS.ttlSeconds / 60));

  return (
    <main className="flex min-h-dvh flex-col px-6 pb-10 pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="size-2 rounded-full bg-primary" aria-hidden />
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {COPY.brand}
          </span>
        </div>
        <ThemeToggle />
      </div>

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
        <header className="mb-8">
          <h1 className="font-serif text-3xl font-medium">{title}</h1>
          <p className="mt-2 leading-relaxed text-muted-foreground">{description}</p>
        </header>

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
            className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
          >
            {login.error}
          </p>
        )}
      </div>

      <p className="mx-auto max-w-sm pt-6 text-center text-xs leading-relaxed text-muted-foreground">
        {COPY.footer}
      </p>
    </main>
  );
}
