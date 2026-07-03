"use client";

import { approveCliDevice } from "@infra/sdk";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/features/session";
import { env } from "@/lib/env";
import { describeError } from "@/lib/errors";

type Outcome = "approved" | "denied" | "not_found" | null;

/**
 * Device-flow approval page (`/auth/cli`). The terminal opens this in the browser,
 * reusing the user's existing web session: an already-signed-in user just confirms
 * the code the CLI showed and approves. Approval binds the pending request to this
 * user server-side; the token is minted for the CLI's poll and never touches the
 * browser. See `docs/plans/cli-plan.md`.
 */
export default function CliActivatePage() {
  const { status, user } = useSession();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [error, setError] = useState<string | null>(null);

  // Prefill from the CLI's verification link (`?user_code=XXXX-XXXX`).
  useEffect(() => {
    const prefill = new URLSearchParams(window.location.search).get("user_code");
    if (prefill) setCode(prefill);
  }, []);

  async function submit(deny: boolean): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await approveCliDevice(env.apiBaseUrl, { userCode: code, deny });
      setOutcome(res.result);
    } catch (err) {
      setError(describeError(err, "操作失败,请重试。"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="absolute right-4 top-4">
        <ModeToggle />
      </div>

      <Card className="w-full max-w-[420px]">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2.5">
            <span className="size-2 rounded-full bg-primary" aria-hidden />
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              infra-lab · CLI
            </span>
          </div>
          <CardTitle className="font-serif text-2xl font-medium">终端登录授权</CardTitle>
          <CardDescription className="leading-relaxed">
            确认终端显示的登录码后授权,即可在命令行完成登录。
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {status === "loading" && (
            <p className="text-sm text-muted-foreground">正在检查登录状态…</p>
          )}

          {status === "unauthenticated" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                请先登录网页端,再回到此页面授权终端登录。
              </p>
              <Button asChild className="w-full">
                <Link href="/auth">去登录</Link>
              </Button>
            </div>
          )}

          {status === "authenticated" && outcome === "approved" && (
            <p className="text-sm font-medium text-primary">已授权,请回到终端,登录将自动完成。</p>
          )}
          {status === "authenticated" && outcome === "denied" && (
            <p className="text-sm text-muted-foreground">已拒绝该登录请求。</p>
          )}
          {status === "authenticated" && outcome === "not_found" && (
            <p className="text-sm text-destructive">登录码无效或已过期,请在终端重试。</p>
          )}

          {status === "authenticated" && outcome === null && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="user-code">登录码</Label>
                <Input
                  id="user-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="XXXX-XXXX"
                  autoComplete="off"
                  className="font-mono tracking-widest"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                当前账号:<span className="font-mono">{user?.phone}</span>
              </p>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  disabled={busy || code.trim().length === 0}
                  onClick={() => submit(false)}
                >
                  授权登录
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => submit(true)}>
                  拒绝
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
