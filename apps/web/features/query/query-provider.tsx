"use client";

import { HttpAuthError } from "@infra/sdk";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

import { emitUnauthorized } from "@/lib/auth-events";

/** Any 401 from a cached request means the cookie session expired — notify the session layer. */
function reportIfUnauthorized(error: unknown): void {
  if (error instanceof HttpAuthError && error.status === 401) emitUnauthorized();
}

/**
 * App-wide TanStack Query client. Server state (todos, account lists) lives here
 * so navigations reuse the cache instead of re-fetching, and mutations can update
 * the cache directly. The client is created once per mount (via `useState`) so it
 * survives re-renders but isn't shared across requests.
 *
 * A global 401 handler on both caches turns any expired-session request into a
 * single {@link emitUnauthorized} signal, so callers don't each have to handle it.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: reportIfUnauthorized }),
        mutationCache: new MutationCache({ onError: reportIfUnauthorized }),
        defaultOptions: {
          queries: {
            // Cookie-backed data — a short stale window keeps lists fresh across
            // navigations without hammering the API, and window focus is noisy.
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
