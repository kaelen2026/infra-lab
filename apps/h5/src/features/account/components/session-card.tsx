import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Fixed-height key/value row so values don't jitter as content changes. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-9 items-center justify-between border-b border-border/60 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

/** Current web session facts. h5 rides the HttpOnly cookie, so there's no token to show. */
export function SessionCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4 text-muted-foreground" />
          当前会话
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Row label="平台">
          <Badge variant="outline">Web</Badge>
        </Row>
        <Row label="凭证">
          <span className="font-mono text-xs">infra.session · HttpOnly Cookie</span>
        </Row>
        <Row label="状态">
          <Badge variant="success">活跃</Badge>
        </Row>
      </CardContent>
    </Card>
  );
}
