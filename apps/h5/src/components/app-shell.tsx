import { ListTodo, LogOut, User } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/session";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/", label: "账户", icon: User },
  { to: "/todos", label: "待办", icon: ListTodo },
] as const;

/**
 * Frame for the authed routes: a sticky brand header (theme + logout) and a fixed
 * bottom tab bar. Both honour the iOS safe-area insets. `<Outlet />` renders the
 * active tab; `main` reserves bottom padding so content clears the tab bar.
 */
export function AppShell() {
  const { logout } = useSession();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/auth", { replace: true });
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <span className="size-2 rounded-full bg-primary" aria-hidden />
            <span className="font-serif text-lg font-medium tracking-tight">infra-lab</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="icon" aria-label="退出登录" onClick={handleLogout}>
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-6">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-md items-stretch">
          {TABS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground",
                )
              }
            >
              <Icon className="size-5" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
