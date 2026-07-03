"use client";

import { COPY } from "@infra/design";
import type { AuthUser } from "@infra/sdk";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { useToast } from "@/features/toast";
import { authClient } from "@/lib/auth-client";
import { onUnauthorized } from "@/lib/auth-events";
import { logger } from "@/lib/logger";

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

interface SessionValue {
  user: AuthUser | null;
  status: SessionStatus;
  /** Re-fetch the current user (call after a successful login). */
  refresh: () => Promise<void>;
  /** Clear the server session and local state. */
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

/** Holds the current user, resolved from the HttpOnly cookie via the SDK `me()`. */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // Mirror status in a ref so the (stable) unauthorized handler reads the live value
  // without re-subscribing on every status change.
  const statusRef = useRef<SessionStatus>(status);
  statusRef.current = status;

  const refresh = useCallback(async () => {
    try {
      const me = await authClient.me();
      setUser(me);
      setStatus("authenticated");
    } catch {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authClient.logout();
    } finally {
      setUser(null);
      setStatus("unauthenticated");
      // Drop every cached query so the next login can't briefly see the previous
      // user's todos/account data on a shared device.
      queryClient.clear();
    }
  }, [queryClient]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A 401 from any cached request (see the query provider) means the cookie session
  // expired mid-use — there's no client-side refresh for web. Reset to unauthenticated
  // (protected pages then redirect to /auth via useRequireAuth), drop cached data, and
  // tell the user why. Skip if already unauthenticated so it fires once per expiry.
  useEffect(() => {
    return onUnauthorized(() => {
      if (statusRef.current === "unauthenticated") return;
      logger.warn("session_expired");
      setUser(null);
      setStatus("unauthenticated");
      queryClient.clear();
      toast(COPY.errors.messages.UNAUTHORIZED, "destructive");
    });
  }, [queryClient, toast]);

  return (
    <SessionContext.Provider value={{ user, status, refresh, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within <SessionProvider>");
  return ctx;
}
