"use client";

import type { AdminStatsDTO, AdminUsersResponse } from "@infra/sdk";
import { useQuery } from "@tanstack/react-query";

import { adminClient } from "@/lib/admin-client";

const ACCESS_KEY = ["admin", "access"] as const;
const STATS_KEY = ["admin", "stats"] as const;
const USERS_KEY = ["admin", "users"] as const;

/**
 * Whether the current session is an admin. Drives the nav entry and the `/admin`
 * page guard. `enabled` gates it on an authenticated session so we never fire the
 * probe for a logged-out visitor. A plain user resolves to `false` (not an error).
 */
export function useAdminAccess(enabled: boolean): { isAdmin: boolean; loading: boolean } {
  const query = useQuery({
    queryKey: ACCESS_KEY,
    queryFn: () => adminClient.access(),
    enabled,
    // Admin status rarely changes within a session; avoid re-probing on every mount.
    staleTime: 5 * 60 * 1000,
  });
  return { isAdmin: query.data ?? false, loading: query.isLoading };
}

export function useAdminStats(enabled: boolean): {
  stats: AdminStatsDTO | null;
  loading: boolean;
  error: boolean;
} {
  const query = useQuery({
    queryKey: STATS_KEY,
    queryFn: () => adminClient.stats(),
    enabled,
  });
  return { stats: query.data ?? null, loading: query.isLoading, error: query.isError };
}

export function useAdminUsers(enabled: boolean): {
  data: AdminUsersResponse | null;
  loading: boolean;
  error: boolean;
} {
  const query = useQuery({
    queryKey: USERS_KEY,
    queryFn: () => adminClient.listUsers(),
    enabled,
  });
  return { data: query.data ?? null, loading: query.isLoading, error: query.isError };
}
