"use client";

import { LoaderCircle, RotateCw, ScanLine } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRedirectIfAuthenticated, useSession } from "@/features/session";
import { QrCode } from "./qr-code";
import { useQrLogin } from "./use-qr-login";

/** Cross-device QR login: render a ticket QR, poll for a native approval, then redirect. */
export default function QrLoginPage() {
  const router = useRouter();
  const { refresh } = useSession();

  // Already signed in? Skip the login screen.
  useRedirectIfAuthenticated();

  const onAuthenticated = useCallback(async () => {
    await refresh();
    router.replace("/");
  }, [refresh, router]);

  const qr = useQrLogin({ onAuthenticated });

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
          <CardTitle className="font-serif text-2xl font-medium">扫码登录</CardTitle>
          <CardDescription className="leading-relaxed">
            用已登录的 App 扫描下方二维码，在手机上确认后即可登录。
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-col items-center gap-4 py-2">
            {qr.phase === "waiting" && qr.ticketId ? (
              <>
                <QrCode value={qr.ticketId} />
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <ScanLine className="size-4" />
                  等待扫码确认…
                </p>
              </>
            ) : qr.phase === "approved" ? (
              <div className="flex h-[256px] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                <LoaderCircle className="size-6 animate-spin" />
                已确认，正在登录…
              </div>
            ) : qr.phase === "loading" ? (
              <div className="grid h-[256px] w-[256px] place-items-center">
                <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              // expired | error
              <div className="flex h-[256px] w-full flex-col items-center justify-center gap-4">
                <p role="alert" className="text-center text-sm text-muted-foreground">
                  {qr.phase === "expired" ? "二维码已过期，请刷新后重试。" : qr.error}
                </p>
                <Button variant="outline" onClick={qr.restart}>
                  <RotateCw className="size-4" />
                  刷新二维码
                </Button>
              </div>
            )}
          </div>

          <div className="border-t pt-4 text-center">
            <Link
              href="/auth"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              使用手机号验证码登录 ›
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
