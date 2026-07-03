"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { qrLoginClient } from "@/lib/auth-client";
import { describeError } from "@/lib/errors";

/** How often the browser polls the ticket status while waiting for a scan. */
const POLL_INTERVAL_MS = 2000;

export type QrPhase =
  | "loading" // creating the ticket
  | "waiting" // QR shown, polling for a native approval
  | "approved" // approved — exchanging the ticket for a session
  | "expired" // ticket lapsed / consumed — user can restart
  | "error"; // transport/other failure

export interface UseQrLoginOptions {
  /** Called once the ticket is consumed and the session cookie is set. */
  onAuthenticated: () => void | Promise<void>;
}

/** Headless QR cross-device login: owns ticket creation, polling and consume. */
export interface QrLogin {
  phase: QrPhase;
  /** The ticket id to encode as a QR code (null until created). */
  ticketId: string | null;
  error: string | null;
  /** Discard the current ticket and start a fresh one. */
  restart: () => void;
}

/**
 * Drives the browser side of QR login: create a ticket, expose its `ticketId` for
 * the view to render as a QR code, poll `status` until a logged-in native client
 * approves it, then `consume` it for this browser's HttpOnly session cookie. The
 * secret `pollToken` never leaves this hook — only `ticketId` is surfaced.
 */
export function useQrLogin({ onAuthenticated }: UseQrLoginOptions): QrLogin {
  const [phase, setPhase] = useState<QrPhase>("loading");
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // Keep the latest callback without re-running the effect (which would re-create tickets).
  const onAuthRef = useRef(onAuthenticated);
  onAuthRef.current = onAuthenticated;

  // `nonce` isn't read in the body — it's the manual re-run trigger for restart():
  // bumping it tears down the current ticket/poll loop and starts a fresh one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: nonce re-runs the effect on restart
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ticket = "";
    let pollToken = "";

    const poll = async (): Promise<void> => {
      try {
        const status = await qrLoginClient.status({ ticketId: ticket, pollToken });
        if (cancelled) return;
        if (status === "approved") {
          setPhase("approved");
          await qrLoginClient.consume({ ticketId: ticket, pollToken });
          if (cancelled) return;
          await onAuthRef.current();
          return;
        }
        if (status === "expired") {
          setPhase("expired");
          return;
        }
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        if (cancelled) return;
        setError(describeError(err));
        setPhase("error");
      }
    };

    (async () => {
      setPhase("loading");
      setError(null);
      setTicketId(null);
      try {
        const res = await qrLoginClient.create();
        if (cancelled) return;
        ticket = res.ticketId;
        pollToken = res.pollToken;
        setTicketId(res.ticketId);
        setPhase("waiting");
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        if (cancelled) return;
        setError(describeError(err));
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [nonce]);

  const restart = useCallback(() => setNonce((n) => n + 1), []);

  return { phase, ticketId, error, restart };
}
