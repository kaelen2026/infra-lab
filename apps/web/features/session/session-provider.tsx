"use client";

import type { AuthUser } from "@infra/sdk";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";

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
