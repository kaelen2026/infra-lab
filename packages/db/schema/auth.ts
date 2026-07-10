import { relations } from "drizzle-orm";
import { boolean, index, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/** device.platform — the supported clients (`cli` = terminal client apps/cli; `weapp` = WeChat mini-program apps/miniprogram). */
export const platformEnum = pgEnum("platform", [
  "web",
  "ios",
  "android",
  "harmony",
  "cli",
  "weapp",
]);

/**
 * user.role — persisted identity. `user` is every logged-in account (the default);
 * `admin` may reach the web management console (/admin). A third identity, "guest",
 * is simply an unauthenticated visitor and is NOT stored here. Keep these values in
 * sync with `USER_ROLES` in `@infra/shared`'s admin contract.
 */
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);

// ──────────────────────────────────────────────────────────────────────────────
// Better Auth core tables (user / session / account / verification).
// Column names match Better Auth's defaults so the drizzle adapter resolves them.
// ──────────────────────────────────────────────────────────────────────────────

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    email: text("email"),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    // Phone is the primary identifier for this product.
    phone: text("phone"),
    phoneVerified: boolean("phone_verified").notNull().default(false),
    // Identity role — see userRoleEnum. Defaults to `user`; promote to `admin` to
    // grant the management console (scripts/grant-admin.mjs).
    role: userRoleEnum("role").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("user_phone_key").on(t.phone), uniqueIndex("user_email_key").on(t.email)],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("session_token_key").on(t.token), index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ──────────────────────────────────────────────────────────────────────────────
// Product tables.
// ──────────────────────────────────────────────────────────────────────────────

/** One profile per user, created automatically when a new phone verifies. */
export const profile = pgTable("profile", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  locale: text("locale").notNull().default("zh-CN"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A physical install of one of the clients. */
export const device = pgTable(
  "device",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    deviceId: text("device_id").notNull(),
    model: text("model"),
    osVersion: text("os_version"),
    appVersion: text("app_version"),
    pushToken: text("push_token"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("device_user_device_key").on(t.userId, t.deviceId),
    index("device_user_id_idx").on(t.userId),
  ],
);

/**
 * Long-lived refresh tokens for native clients (web uses the session cookie).
 * Only a hash is stored; rotation links new → old via `replacedBy`.
 */
export const refreshToken = pgTable(
  "refresh_token",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    deviceId: text("device_id"),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    replacedBy: text("replaced_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("refresh_token_hash_key").on(t.tokenHash),
    index("refresh_token_user_id_idx").on(t.userId),
  ],
);

/** Audit trail of every OTP verification attempt (success and failure). */
export const loginEvent = pgTable(
  "login_event",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    // Nullable: a social sign-in (Google) has no phone credential, so its audited
    // login events carry `null` here. Phone-OTP events still record the phone.
    phone: text("phone"),
    platform: platformEnum("platform").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    success: boolean("success").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_event_phone_idx").on(t.phone)],
);

// ── Relations ───────────────────────────────────────────────────────────────────
export const userRelations = relations(user, ({ one, many }) => ({
  profile: one(profile, { fields: [user.id], references: [profile.userId] }),
  devices: many(device),
  sessions: many(session),
  refreshTokens: many(refreshToken),
}));

export const profileRelations = relations(profile, ({ one }) => ({
  user: one(user, { fields: [profile.userId], references: [user.id] }),
}));

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Profile = typeof profile.$inferSelect;
export type Device = typeof device.$inferSelect;
export type RefreshToken = typeof refreshToken.$inferSelect;
export type LoginEvent = typeof loginEvent.$inferSelect;
