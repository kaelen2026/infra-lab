import type { DeviceDTO, LoginEventDTO } from "@infra/sdk";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";

interface AccountData {
  devices: DeviceDTO[] | null;
  events: LoginEventDTO[] | null;
  loading: boolean;
  error: string | null;
}

/** Loads the current user's devices + login history once `enabled` (authenticated). */
export function useAccountData(enabled: boolean): AccountData {
  const [devices, setDevices] = useState<DeviceDTO[] | null>(null);
  const [events, setEvents] = useState<LoginEventDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    (async () => {
      try {
        const [d, e] = await Promise.all([authClient.listDevices(), authClient.listLoginEvents()]);
        if (!active) return;
        setDevices(d);
        setEvents(e);
      } catch {
        if (active) setError("无法加载账户数据，请稍后重试。");
      }
    })();
    return () => {
      active = false;
    };
  }, [enabled]);

  return {
    devices,
    events,
    error,
    loading: enabled && !error && (devices === null || events === null),
  };
}
