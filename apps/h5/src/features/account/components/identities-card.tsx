import { COPY } from "@infra/design";
import { HttpAuthError, maskPhone, type SocialProvider, socialLinkStartUrl } from "@infra/sdk";
import { KeyRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleIcon } from "@/features/auth/components/google-icon";
import { useSession } from "@/features/session";
import { API_BASE, accountLinkClient, authClient } from "@/lib/auth-client";

const googleEnabled = import.meta.env.VITE_GOOGLE_ENABLED === "true";

function errorText(err: unknown): string {
  if (err instanceof HttpAuthError && err.code in COPY.errors.messages) {
    return COPY.errors.messages[err.code as keyof typeof COPY.errors.messages];
  }
  return COPY.errors.generic;
}

/**
 * Account security (h5): the sign-in methods linked to this account. A user must keep
 * ≥1 (server enforces `LAST_CREDENTIAL`). Google links via a full-page redirect; phone
 * links via an inline OTP. Plain state (no react-query, matching this app).
 */
export function IdentitiesCard() {
  const { user, refresh } = useSession();
  const [providers, setProviders] = useState<SocialProvider[] | null>(null);
  const [busy, setBusy] = useState(false);

  const hasPhone = user?.phone != null;
  const googleLinked = providers?.includes("google") ?? false;
  const credentials = (hasPhone ? 1 : 0) + (providers?.length ?? 0);
  const isLast = credentials <= 1;

  const loadIdentities = useCallback(async () => {
    try {
      const res = await accountLinkClient.identities();
      setProviders(res.providers);
    } catch {
      setProviders([]);
    }
  }, []);

  useEffect(() => {
    void loadIdentities();
  }, [loadIdentities]);

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function refreshAll(): Promise<void> {
    await refresh();
    await loadIdentities();
  }

  async function doUnlink(target: "google" | "phone"): Promise<void> {
    setBusy(true);
    setFormError(null);
    try {
      await accountLinkClient.unlink(target);
      await refreshAll();
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendCode(): Promise<void> {
    setBusy(true);
    setFormError(null);
    try {
      await authClient.requestOtp({ phone: phone.trim(), platform: "web" });
      setSent(true);
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmLinkPhone(): Promise<void> {
    setBusy(true);
    setFormError(null);
    try {
      await accountLinkClient.linkPhone({ phone: phone.trim(), code: code.trim() });
      setSent(false);
      setPhone("");
      setCode("");
      await refreshAll();
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4 text-muted-foreground" />
          登录方式
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border/60 py-2">
          <span className="text-sm text-muted-foreground">Google</span>
          <div className="flex items-center gap-2">
            {googleLinked ? (
              <>
                <Badge variant="success">已绑定</Badge>
                <Button
                  variant="ghost"
                  disabled={isLast || busy}
                  onClick={() => void doUnlink("google")}
                >
                  解绑
                </Button>
              </>
            ) : googleEnabled ? (
              <a
                href={socialLinkStartUrl(API_BASE, "google", "/account")}
                className={buttonClasses({ variant: "outline" })}
              >
                <GoogleIcon className="size-4" />
                绑定
              </a>
            ) : (
              <span className="text-sm text-muted-foreground">未开启</span>
            )}
          </div>
        </div>

        <div className="flex min-h-11 items-center justify-between gap-3 py-2">
          <span className="text-sm text-muted-foreground">手机号</span>
          <div className="flex items-center gap-2">
            {hasPhone ? (
              <>
                <span className="font-mono text-sm">{maskPhone(user?.phone ?? "")}</span>
                <Button
                  variant="ghost"
                  disabled={isLast || busy}
                  onClick={() => void doUnlink("phone")}
                >
                  解绑
                </Button>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">未绑定</span>
            )}
          </div>
        </div>

        {!hasPhone && (
          <div className="mt-3 space-y-3 rounded-lg border border-border/60 p-3">
            <Label htmlFor="link-phone">绑定手机号</Label>
            <div className="flex gap-2">
              <Input
                id="link-phone"
                inputMode="tel"
                placeholder="+8613800138000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={sent}
              />
              <Button
                variant="outline"
                disabled={!phone.trim() || sent || busy}
                onClick={() => void sendCode()}
              >
                获取验证码
              </Button>
            </div>
            {sent && (
              <div className="flex gap-2">
                <Input
                  inputMode="numeric"
                  placeholder="6 位验证码"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <Button disabled={!code.trim() || busy} onClick={() => void confirmLinkPhone()}>
                  确认绑定
                </Button>
              </div>
            )}
          </div>
        )}

        {formError && (
          <p role="alert" className="pt-2 text-sm text-destructive">
            {formError}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
