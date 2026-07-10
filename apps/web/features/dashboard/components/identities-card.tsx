import { COPY } from "@infra/design";
import { HttpAuthError, maskPhone, socialLinkStartUrl } from "@infra/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleIcon } from "@/features/auth/components/google-icon";
import { useSession } from "@/features/session";
import { accountLinkClient, authClient } from "@/lib/auth-client";
import { env } from "@/lib/env";

function errorText(err: unknown): string {
  if (err instanceof HttpAuthError && err.code in COPY.errors.messages) {
    return COPY.errors.messages[err.code as keyof typeof COPY.errors.messages];
  }
  return COPY.errors.generic;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border/60 py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

/**
 * Account security: the sign-in methods linked to this account. A user must keep at
 * least one — the server rejects unlinking the last (`LAST_CREDENTIAL`). Google links
 * via a full-page redirect (`socialLinkStartUrl`); phone links via an inline OTP.
 */
export function IdentitiesCard() {
  const { user, refresh } = useSession();
  const qc = useQueryClient();
  const identities = useQuery({
    queryKey: ["account", "identities"],
    queryFn: () => accountLinkClient.identities(),
  });

  const googleLinked = identities.data?.providers.includes("google") ?? false;
  const hasPhone = user?.phone != null;
  // Keep ≥1 credential: the server enforces it, but disable the button too for clarity.
  const credentials = (hasPhone ? 1 : 0) + (identities.data?.providers.length ?? 0);
  const isLast = credentials <= 1;

  async function refreshAll(): Promise<void> {
    await refresh();
    await qc.invalidateQueries({ queryKey: ["account", "identities"] });
  }

  const unlink = useMutation({
    mutationFn: (target: "google" | "phone") => accountLinkClient.unlink(target),
    onSuccess: refreshAll,
  });

  // ── Inline "link a phone" OTP flow ────────────────────────────────────────────
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const sendCode = useMutation({
    mutationFn: () => authClient.requestOtp({ phone: phone.trim(), platform: "web" }),
    onSuccess: () => {
      setSent(true);
      setFormError(null);
    },
    onError: (err) => setFormError(errorText(err)),
  });
  const linkPhone = useMutation({
    mutationFn: () => accountLinkClient.linkPhone({ phone: phone.trim(), code: code.trim() }),
    onSuccess: async () => {
      setSent(false);
      setPhone("");
      setCode("");
      setFormError(null);
      await refreshAll();
    },
    onError: (err) => setFormError(errorText(err)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4 text-muted-foreground" />
          登录方式
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Google */}
        <Row label="Google">
          {googleLinked ? (
            <>
              <Badge variant="success">已绑定</Badge>
              <Button
                variant="ghost"
                size="sm"
                disabled={isLast || unlink.isPending}
                onClick={() => unlink.mutate("google")}
              >
                解绑
              </Button>
            </>
          ) : env.googleEnabled ? (
            <Button asChild variant="outline" size="sm">
              <a href={socialLinkStartUrl(env.apiBaseUrl, "google", "/")}>
                <GoogleIcon className="size-4" />
                绑定
              </a>
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">未开启</span>
          )}
        </Row>

        {/* Phone */}
        <Row label="手机号">
          {hasPhone ? (
            <>
              <span className="font-mono text-sm">{maskPhone(user?.phone ?? "")}</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={isLast || unlink.isPending}
                onClick={() => unlink.mutate("phone")}
              >
                解绑
              </Button>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">未绑定</span>
          )}
        </Row>

        {/* Inline link-phone form (only when no phone is bound) */}
        {!hasPhone && (
          <div className="mt-4 space-y-3 rounded-lg border border-border/60 p-3">
            <div className="space-y-1.5">
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
                  disabled={!phone.trim() || sent || sendCode.isPending}
                  onClick={() => sendCode.mutate()}
                >
                  {sendCode.isPending ? <Loader2 className="size-4 animate-spin" /> : "获取验证码"}
                </Button>
              </div>
            </div>
            {sent && (
              <div className="flex gap-2">
                <Input
                  inputMode="numeric"
                  placeholder="6 位验证码"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <Button
                  disabled={!code.trim() || linkPhone.isPending}
                  onClick={() => linkPhone.mutate()}
                >
                  {linkPhone.isPending ? <Loader2 className="size-4 animate-spin" /> : "确认绑定"}
                </Button>
              </div>
            )}
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
          </div>
        )}

        {unlink.isError && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {errorText(unlink.error)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
