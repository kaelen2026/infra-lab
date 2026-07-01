import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { Spinner } from "@/components/ui/spinner";
import { useSession } from "./session-provider";

/**
 * Gate for the authed routes. Holds a centered spinner while the cookie session
 * resolves, then either renders the children or bounces to `/auth`.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useSession();

  if (status === "loading") {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner />
      </div>
    );
  }
  if (status === "unauthenticated") return <Navigate to="/auth" replace />;
  return <>{children}</>;
}
