import { z } from "zod";

/**
 * Admin console contracts — the source of truth for the web-only management
 * backend. Access is gated on the persisted user role (`user.role` column): the
 * API resolves the current user through the same `requireUser` guard every other
 * route uses, then checks `role === "admin"`.
 *
 * This is a **web-only** surface: the native clients (ios/android/harmony) do
 * not implement it, so — unlike auth/todo/timeline — adding it is not a
 * cross-client contract change. Phone numbers are only ever returned **masked**
 * (never the full number), keeping the "never expose raw PII" posture even to an
 * admin viewing the user list.
 */

// ── Identity / roles ──────────────────────────────────────────────────────────────
/**
 * Persisted user roles (the `user.role` column). Keep in sync with `userRoleEnum`
 * in `@infra/db`'s auth schema. The product has three identities in total; the
 * third — "guest" — is an unauthenticated visitor and is NOT a stored role (it is
 * derived from the absence of a session), hence it is not in this tuple.
 */
export const USER_ROLES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** The three identities the app distinguishes; "guest" = no session. */
export type Identity = "guest" | UserRole;

// ── Phone masking (shared so the API and any client render it identically) ──────
/**
 * Mask a phone number for display: keep only the last 4 digits, star every
 * other digit (country code included), preserving a leading `+`.
 * `"+8613800138000"` → `"+*********8000"`. A short/empty value degrades
 * gracefully to all-stars (never leaks digits).
 */
export function maskPhone(phone: string): string {
  const plus = phone.startsWith("+") ? "+" : "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return `${plus}${"*".repeat(digits.length)}`;
  const tail = digits.slice(-4);
  return `${plus}${"*".repeat(digits.length - 4)}${tail}`;
}

// ── Requests ────────────────────────────────────────────────────────────────────
/** Query for the paginated user list (simple limit/offset — the admin table is small). */
export const listAdminUsersSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListAdminUsersInput = z.infer<typeof listAdminUsersSchema>;

// ── DTOs ────────────────────────────────────────────────────────────────────────
export interface AdminUserDTO {
  id: string;
  /** Masked for display — the raw number never crosses the wire (see {@link maskPhone}). */
  phoneMasked: string;
  displayName: string | null;
  createdAt: string; // ISO 8601
}

export interface AdminStatsDTO {
  totalUsers: number;
  totalTodos: number;
  totalTimelinePosts: number;
  /** Successful OTP verifications in the last 7 days. */
  loginsLast7d: number;
  /** Failed OTP verifications in the last 7 days. */
  failedLoginsLast7d: number;
}

// ── Error codes (stable, client-switchable) ───────────────────────────────────────
export const ADMIN_ERROR_CODES = [
  "INVALID_REQUEST",
  "UNAUTHORIZED", // no/invalid session
  "FORBIDDEN", // authenticated, but not an admin
] as const;
export type AdminErrorCode = (typeof ADMIN_ERROR_CODES)[number];

export interface AdminError {
  code: AdminErrorCode;
  message: string;
}

// ── Responses ─────────────────────────────────────────────────────────────────────
/**
 * The *current* user's role — drives the web nav entry + page guard. Only reachable
 * by an authenticated user (a guest gets 401), so `role` is always a stored role;
 * `isAdmin` is the convenience derivation `role === "admin"`.
 */
export interface AdminAccessResponse {
  ok: true;
  role: UserRole;
  isAdmin: boolean;
}

export interface AdminStatsResponse {
  ok: true;
  stats: AdminStatsDTO;
}

export interface AdminUsersResponse {
  ok: true;
  users: AdminUserDTO[];
  /** Offset to pass for the next page, or null when the last page was returned. */
  nextOffset: number | null;
}

// ── Endpoint paths (shared so the SDK never hard-codes strings) ─────────────────────
export const ADMIN_ROUTES = {
  access: "/admin/access",
  stats: "/admin/stats",
  users: "/admin/users",
} as const;

// ── SDK interface (web-only) ────────────────────────────────────────────────────────
/**
 * The admin client the web app consumes. Rides the same cookie transport as the
 * other web clients; non-2xx responses throw the shared `HttpAuthError`, whose
 * `code` carries the {@link AdminErrorCode} (`FORBIDDEN` → 403 for a non-admin).
 */
export interface AdminClient {
  /** The current session's role + admin flag (never throws for a plain logged-in user). */
  access(): Promise<{ role: UserRole; isAdmin: boolean }>;
  stats(): Promise<AdminStatsDTO>;
  listUsers(input?: Partial<ListAdminUsersInput>): Promise<AdminUsersResponse>;
}
