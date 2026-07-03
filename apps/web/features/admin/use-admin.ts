"use client";

import type { AdminStatsDTO, AdminUsersResponse, Identity, UserRole } from "@infra/sdk";
import { useQuery } from "@tanstack/react-query";

import { adminClient } from "@/lib/admin-client";

const ACCESS_KEY = ["admin", "access"] as const;
const STATS_KEY = ["admin", "stats"] as const;
const USERS_KEY = ["admin", "users"] as const;

/**
 * The current session's role + admin flag, and the derived three-state identity
 * (`guest` when the visitor is unauthenticated — `enabled` false — otherwise the
 * server-reported role). Drives the nav entry, the account role badge and the
 * `/admin` page guard. `enabled` gates the probe on an authenticated session so we
 * never fire it for a logged-out visitor.
 */
export function useAdminAccess(enabled: boolean): {
  role: UserRole | null;
  isAdmin: boolean;
  identity: Identity;
  loading: boolean;
} {
  const query = useQuery({
    queryKey: ACCESS_KEY,
    queryFn: () => adminClient.access(),
    enabled,
    // Role rarely changes within a session; avoid re-probing on every mount.
    staleTime: 5 * 60 * 1000,
  });
  const role = query.data?.role ?? null;
  // Unauthenticated (probe disabled) ⇒ guest; otherwise the server-reported role.
  const identity: Identity = !enabled ? "guest" : (role ?? "guest");
  return { role, isAdmin: query.data?.isAdmin ?? false, identity, loading: query.isLoading };
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
