import type { DeviceDTO } from "@infra/sdk";
import { Smartphone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, platformLabel } from "@/lib/format";

interface DevicesCardProps {
  devices: DeviceDTO[] | null;
  loading: boolean;
}

/** Registered native installs. Web sessions never register a device, so this is often empty. */
export function DevicesCard({ devices, loading }: DevicesCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="size-4 text-muted-foreground" />
          设备
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
          </div>
        ) : devices && devices.length > 0 ? (
          <ul className="space-y-3">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">{d.model ?? "未知机型"}</p>
                  <p className="font-mono text-xs text-muted-foreground tabular-nums">
                    最近 {formatDate(d.lastSeenAt)}
                  </p>
                </div>
                <Badge variant="outline">{platformLabel(d.platform)}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            还没有原生设备登录。iOS / Android / HarmonyOS 客户端登录后会出现在这里。
          </p>
        )}
      </CardContent>
    </Card>
  );
}
