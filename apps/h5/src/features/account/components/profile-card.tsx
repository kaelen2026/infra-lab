import type { AuthUser } from "@infra/sdk";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";

function monogram(user: AuthUser): string {
  const name = user.displayName?.trim();
  if (name) return (Array.from(name)[0] ?? "·").toUpperCase();
  const digits = (user.phone ?? "").replace(/\D/g, "");
  return digits.slice(-2) || "··";
}

/** The hero of the account tab: who you are. */
export function ProfileCard({ user }: { user: AuthUser }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <Avatar className="size-14 text-lg">
          {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
          <AvatarFallback>{monogram(user)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h2
            className="truncate font-serif text-xl font-medium"
            lang={user.displayName ? "zh" : "en"}
          >
            {user.displayName ?? "未命名用户"}
          </h2>
          <p className="mt-0.5 font-mono text-sm text-muted-foreground">{user.phone}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            注册于 <span className="font-mono tabular-nums">{formatDate(user.createdAt)}</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
