import { OTP_LIMITS } from "@infra/shared";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CodeStepProps {
  code: string;
  busy: boolean;
  cooldown: number;
  canVerify: boolean;
  canResend: boolean;
  onCodeChange: (value: string) => void;
  onVerify: () => void;
  onResend: () => void;
  onChangePhone: () => void;
}

/** Step 2: enter the 6-digit code, resend, or go back. Presentational only. */
export function CodeStep({
  code,
  busy,
  cooldown,
  canVerify,
  canResend,
  onCodeChange,
  onVerify,
  onResend,
  onChangePhone,
}: CodeStepProps) {
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (canVerify && !busy) onVerify();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="code">6 位验证码</Label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={OTP_LIMITS.codeLength}
          placeholder="••••••"
          className="text-center font-mono text-lg tracking-[0.5em]"
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          autoFocus
        />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={busy || !canVerify}>
        {busy ? <LoaderCircle className="animate-spin" /> : null}
        {busy ? "验证中…" : "登录 / 注册"}
      </Button>
      <div className="flex items-center justify-between">
        <Button type="button" variant="link" className="h-auto p-0" onClick={onChangePhone}>
          ‹ 更换手机号
        </Button>
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-muted-foreground"
          disabled={!canResend || busy}
          onClick={onResend}
        >
          {canResend ? "重新发送" : `${cooldown}s 后重新发送`}
        </Button>
      </div>
    </form>
  );
}
