"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useSession } from "./session-provider";

/**
 * Client-side guard for protected pages. Redirects unauthenticated visitors to
 * `/auth` and reports whether the session is ready to render.
 *
 * Protection is *necessarily* client-side: the session rides the HttpOnly
 * `infra.session` cookie set by the API on its own origin (:3001), so a Next
 * `middleware.ts` on the web origin (:3000) can't read it — an edge guard would be
 * blind. This hook replaces the identical `useEffect` redirect the dashboard, todo
 * and timeline pages each hand-rolled.
 */
export function useRequireAuth(): { ready: boolean } {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/auth");
  }, [status, router]);

  return { ready: status === "authenticated" };
}

/**
 * Inverse guard for the login page: once authenticated, skip the login screen and
 * go home. Returns whether the login UI should still render.
 */
export function useRedirectIfAuthenticated(): { showLogin: boolean } {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  return { showLogin: status !== "authenticated" };
}
