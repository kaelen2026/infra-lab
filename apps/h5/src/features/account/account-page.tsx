import { useSession } from "@/features/session";
import { DevicesCard } from "./components/devices-card";
import { LoginEventsCard } from "./components/login-events-card";
import { ProfileCard } from "./components/profile-card";
import { SessionCard } from "./components/session-card";
import { useAccountData } from "./use-account-data";

/** Account tab: profile, current session, registered devices, and the login audit trail. */
export function AccountPage() {
  const { user, status } = useSession();
  const { devices, events, loading, error } = useAccountData(status === "authenticated");

  // RequireAuth guarantees an authenticated session before mounting; guard for types.
  if (!user) return null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-2xl font-medium">账户</h1>
        <p className="mt-1 text-sm text-muted-foreground">你的资料、当前会话与登录记录。</p>
      </header>

      <ProfileCard user={user} />
      <SessionCard />
      <DevicesCard devices={devices} loading={loading} />
      <LoginEventsCard events={events} loading={loading} />

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
