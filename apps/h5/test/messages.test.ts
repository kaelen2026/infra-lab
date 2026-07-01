import { COPY, ERROR_MESSAGES } from "@infra/design";
import { HttpAuthError } from "@infra/sdk";
import { describe, expect, it } from "vitest";

import { describeAuthError } from "../src/lib/messages";

describe("describeAuthError", () => {
  it("maps a known auth error code to its canonical @infra/design copy", () => {
    const err = new HttpAuthError(429, { code: "RESEND_COOLDOWN" });
    expect(describeAuthError(err)).toBe(ERROR_MESSAGES.RESEND_COOLDOWN);
  });

  it("appends the remaining-attempts hint for a wrong code", () => {
    const err = new HttpAuthError(400, { code: "INVALID_CODE", remainingAttempts: 3 });
    const msg = describeAuthError(err);
    expect(msg).toContain(ERROR_MESSAGES.INVALID_CODE);
    expect(msg).toContain("3");
  });

  it("falls back to the network message for a non-HTTP error", () => {
    expect(describeAuthError(new Error("boom"))).toBe(COPY.errors.network);
  });
});
