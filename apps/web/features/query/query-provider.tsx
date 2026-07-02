"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

/**
 * App-wide TanStack Query client. Server state (todos, account lists) lives here
 * so navigations reuse the cache instead of re-fetching, and mutations can update
 * the cache directly. The client is created once per mount (via `useState`) so it
 * survives re-renders but isn't shared across requests.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
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
