import type { LoginEventDTO } from "@infra/sdk";
import { History } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, platformLabel } from "@/lib/format";

interface LoginEventsCardProps {
  events: LoginEventDTO[] | null;
  loading: boolean;
}

/** Recent OTP verification attempts (success and failure), newest first. */
export function LoginEventsCard({ events, loading }: LoginEventsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4 text-muted-foreground" />
          最近登录
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-4/5" />
          </div>
        ) : events && events.length > 0 ? (
          <ul className="divide-y divide-border/60">
            {events.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {formatDateTime(e.createdAt)}
                </span>
                <div className="flex items-center gap-2">
                  {e.ip ? (
                    <span className="font-mono text-xs text-muted-foreground">{e.ip}</span>
                  ) : null}
                  <Badge variant="outline">{platformLabel(e.platform)}</Badge>
                  <Badge variant={e.success ? "success" : "destructive"}>
                    {e.success ? "成功" : "失败"}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">还没有登录记录。</p>
        )}
      </CardContent>
    </Card>
  );
}
