"use client";

import { DashboardPage } from "@/features/dashboard";
import { LandingPage } from "@/features/landing";
import { useSession } from "@/features/session";

/**
 * The default `/` route. It is public: signed-out visitors see the marketing
 * {@link LandingPage} instead of being bounced to `/auth`, while signed-in users get
 * the account {@link DashboardPage} — so every existing "redirect home" (`/auth`, the
 * nav brand, QR/Google callbacks) keeps landing here unchanged.
 *
 * Branching is explicit per status rather than a fallthrough so the dashboard (which
 * runs its own `useRequireAuth` guard) only mounts once authenticated and never races
 * a redirect against the landing page while the session is still resolving.
 */
export default function HomePage() {
  const { status } = useSession();

  if (status === "authenticated") return <DashboardPage />;
  if (status === "unauthenticated") return <LandingPage />;
  // Session still resolving: hold a blank full-height frame to avoid flashing the
  // landing page before we know whether this visitor is signed in.
  return <div className="min-h-dvh" />;
}
