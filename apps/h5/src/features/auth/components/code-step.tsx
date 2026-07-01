import { COPY } from "@infra/design";
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
        <Label htmlFor="code">{COPY.code.label}</Label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          enterKeyHint="go"
          maxLength={OTP_LIMITS.codeLength}
          placeholder={COPY.code.placeholder}
          className="text-center text-lg tracking-[0.5em] font-mono"
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
        />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={busy || !canVerify}>
        {busy ? <LoaderCircle className="animate-spin" /> : null}
        {busy ? COPY.code.submitBusy : COPY.code.submit}
      </Button>
      <div className="flex items-center justify-between text-sm">
        <Button type="button" variant="link" className="h-auto p-0" onClick={onChangePhone}>
          {COPY.code.changePhone}
        </Button>
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-muted-foreground"
          disabled={!canResend || busy}
          onClick={onResend}
        >
          {canResend
            ? COPY.code.resend
            : COPY.code.resendCooldown.replace("{seconds}", String(cooldown))}
        </Button>
      </div>
    </form>
  );
}
