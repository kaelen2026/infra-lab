import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "@/components/app-shell";
import { AccountPage } from "@/features/account";
import { AuthPage } from "@/features/auth";
import { RequireAuth, SessionProvider } from "@/features/session";
import { TimelineSharePage } from "@/features/timeline-share";
import { TodosPage } from "@/features/todos";

/**
 * Route map. `/auth` and `/t/:id` (a public timeline share landing) are open;
 * everything else lives behind `RequireAuth`, which resolves the HttpOnly-cookie
 * session via the SDK and redirects out if absent. `AppShell` frames the authed
 * routes with the header + bottom tab bar.
 */
export default function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/t/:id" element={<TimelineSharePage />} />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/" element={<AccountPage />} />
          <Route path="/todos" element={<TodosPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SessionProvider>
  );
}
