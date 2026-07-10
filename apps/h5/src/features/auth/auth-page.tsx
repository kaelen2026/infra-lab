import { COPY } from "@infra/design";
import { LEGAL_ROUTES, OTP_LIMITS, socialStartUrl } from "@infra/shared";
import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ThemeToggle } from "@/components/theme-toggle";
import { buttonClasses } from "@/components/ui/button";
import { useSession } from "@/features/session";
import { API_BASE } from "@/lib/auth-client";
import { CodeStep } from "./components/code-step";
import { GoogleIcon } from "./components/google-icon";
import { PhoneStep } from "./components/phone-step";
import { useOtpLogin } from "./use-otp-login";

// Show the Google button only when the backend has Google configured (kept in sync via
// this build-time flag — see vite-env.d.ts). Default hidden.
const googleEnabled = import.meta.env.VITE_GOOGLE_ENABLED === "true";
// Full-page navigation to the API redirect flow; the server bridges the callback into
// our `infra.session` cookie and lands back at `/` (the session provider re-checks on mount).
const googleSignInUrl = socialStartUrl(API_BASE, "google");

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

        {login.step === "phone" && googleEnabled && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" aria-hidden />
              {COPY.social.divider}
              <span className="h-px flex-1 bg-border" aria-hidden />
            </div>
            <a
              href={googleSignInUrl}
              className={buttonClasses({ variant: "outline", size: "lg", className: "w-full" })}
            >
              <GoogleIcon className="size-4" />
              {COPY.social.googleButton}
            </a>
          </div>
        )}
      </div>

      <p className="mx-auto max-w-sm pt-6 text-center text-xs leading-relaxed text-muted-foreground">
        {COPY.legal.consentPrefix}
        <Link to={LEGAL_ROUTES.terms} className="text-foreground underline underline-offset-2">
          {COPY.legal.termsLabel}
        </Link>
        {COPY.legal.and}
        <Link to={LEGAL_ROUTES.privacy} className="text-foreground underline underline-offset-2">
          {COPY.legal.privacyLabel}
        </Link>
      </p>
    </main>
  );
}
