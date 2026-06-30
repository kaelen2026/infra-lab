"use client";

import type { AuthUser } from "@infra/sdk";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ModeToggle } from "@/components/mode-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/features/session";

/** Avatar monogram: first glyph of a name, else the last two phone digits. */
function monogram(user: AuthUser): string {
  const name = user.displayName?.trim();
  if (name) return (Array.from(name)[0] ?? "·").toUpperCase();
  const digits = user.phone.replace(/\D/g, "");
  return digits.slice(-2) || "··";
}

/** Top navigation for authenticated pages: brand, theme toggle, user menu with logout. */
export function AppNav() {
  const { user, status, logout } = useSession();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.replace("/auth");
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="size-2 rounded-full bg-primary" aria-hidden />
          <span className="font-serif text-lg font-medium tracking-tight">infra-lab</span>
        </Link>

        <div className="flex items-center gap-1">
          <ModeToggle />

          {status === "loading" ? (
            <Skeleton className="size-9 rounded-full" />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full" aria-label="账户菜单">
                  <Avatar>
                    <AvatarFallback>{monogram(user)}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span lang={user.displayName ? "zh" : "en"}>
                    {user.displayName ?? "未命名用户"}
                  </span>
                  <span className="font-mono text-xs font-normal text-muted-foreground">
                    {user.phone}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={handleLogout}>
                  <LogOut />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </header>
  );
}
