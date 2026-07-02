"use client";

import type { DeviceDTO, LoginEventDTO } from "@infra/sdk";
import { useQuery } from "@tanstack/react-query";

import { authClient } from "@/lib/auth-client";

interface AccountData {
  devices: DeviceDTO[] | null;
  events: LoginEventDTO[] | null;
  loading: boolean;
  error: string | null;
}

/** Loads the current user's devices + login history once `enabled` (authenticated). */
export function useAccountData(enabled: boolean): AccountData {
  const devicesQuery = useQuery({
    queryKey: ["account", "devices"],
    queryFn: () => authClient.listDevices(),
    enabled,
  });
  const eventsQuery = useQuery({
    queryKey: ["account", "loginEvents"],
    queryFn: () => authClient.listLoginEvents(),
    enabled,
  });

  const error =
    devicesQuery.isError || eventsQuery.isError ? "无法加载账户数据，请稍后重试。" : null;

  return {
    devices: devicesQuery.data ?? null,
    events: eventsQuery.data ?? null,
    error,
    loading: devicesQuery.isLoading || eventsQuery.isLoading,
  };
}
