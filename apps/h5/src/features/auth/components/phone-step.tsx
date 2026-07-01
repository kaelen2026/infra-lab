import { COPY } from "@infra/design";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PhoneStepProps {
  phone: string;
  busy: boolean;
  canSend: boolean;
  onPhoneChange: (value: string) => void;
  onSend: () => void;
}

/** Step 1: collect the phone number and request an OTP. Presentational only. */
export function PhoneStep({ phone, busy, canSend, onPhoneChange, onSend }: PhoneStepProps) {
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend && !busy) onSend();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="phone">{COPY.phone.label}</Label>
        <Input
          id="phone"
          inputMode="tel"
          autoComplete="tel"
          enterKeyHint="send"
          placeholder={COPY.phone.placeholder}
          className="font-mono"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
        />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={busy || !canSend}>
        {busy ? <LoaderCircle className="animate-spin" /> : null}
        {busy ? COPY.phone.submitBusy : COPY.phone.submit}
      </Button>
    </form>
  );
}
