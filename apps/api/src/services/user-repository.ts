import { randomUUID } from "node:crypto";
import { type Db, device as deviceTable, loginEvent, profile, user } from "@infra/db";
import type { DeviceInfo, Platform } from "@infra/shared";
import { and, desc, eq } from "drizzle-orm";
import type { UserRecord, UserRepository } from "../routes/auth.routes.js";

/** Drizzle-backed {@link UserRepository}. */
export function createUserRepository(db: Db): UserRepository {
  async function loadByPhone(phone: string): Promise<UserRecord | null> {
    const rows = await db
      .select({ user, profile })
      .from(user)
      .leftJoin(profile, eq(profile.userId, user.id))
      .where(eq(user.phone, phone))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.user.id,
      phone: row.user.phone ?? null,
      email: row.user.email ?? null,
      displayName: row.profile?.displayName ?? null,
      avatarUrl: row.profile?.avatarUrl ?? null,
      role: row.user.role,
      createdAt: row.user.createdAt,
    };
  }

  async function loadByEmail(email: string): Promise<UserRecord | null> {
    const rows = await db
      .select({ user, profile })
      .from(user)
      .leftJoin(profile, eq(profile.userId, user.id))
      .where(eq(user.email, email))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.user.id,
      phone: row.user.phone ?? null,
      email: row.user.email ?? null,
      displayName: row.profile?.displayName ?? null,
      avatarUrl: row.profile?.avatarUrl ?? null,
      role: row.user.role,
      createdAt: row.user.createdAt,
    };
  }

  async function loadById(id: string): Promise<UserRecord | null> {
    const rows = await db
      .select({ user, profile })
      .from(user)
      .leftJoin(profile, eq(profile.userId, user.id))
      .where(eq(user.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.user.id,
      phone: row.user.phone ?? null,
      email: row.user.email ?? null,
      displayName: row.profile?.displayName ?? null,
      avatarUrl: row.profile?.avatarUrl ?? null,
      role: row.user.role,
      createdAt: row.user.createdAt,
    };
  }

  return {
    findByPhone: loadByPhone,
    findByEmail: loadByEmail,
    findById: loadById,

    async createWithProfile(phone) {
      const id = randomUUID();
      const now = new Date();
      await db.transaction(async (tx) => {
        await tx
          .insert(user)
          .values({ id, phone, phoneVerified: true, createdAt: now, updatedAt: now });
        await tx.insert(profile).values({ id: randomUUID(), userId: id });
      });
      // New accounts default to the `user` role (the DB default); promote to admin
      // out-of-band via scripts/grant-admin.mjs.
      return {
        id,
        phone,
        email: null,
        displayName: null,
        avatarUrl: null,
        role: "user",
        createdAt: now,
      };
    },

    async createWithProfileByEmail(email) {
      const id = randomUUID();
      const now = new Date();
      await db.transaction(async (tx) => {
        // emailVerified: the OTP round-trip just proved control of the address.
        await tx
          .insert(user)
          .values({ id, email, emailVerified: true, createdAt: now, updatedAt: now });
        await tx.insert(profile).values({ id: randomUUID(), userId: id });
      });
      return {
        id,
        phone: null,
        email,
        displayName: null,
        avatarUrl: null,
        role: "user",
        createdAt: now,
      };
    },

    async ensureProfile(userId, hints) {
      // profile.userId is unique — onConflictDoNothing makes this idempotent, so a
      // returning social user (profile already present) is untouched. Only the first
      // sign-in seeds displayName/avatar from the provider's hints. `returning` is
      // empty on conflict, so a non-empty result means we inserted (a new account).
      const inserted = await db
        .insert(profile)
        .values({
          id: randomUUID(),
          userId,
          displayName: hints.displayName ?? null,
          avatarUrl: hints.avatarUrl ?? null,
        })
        .onConflictDoNothing({ target: profile.userId })
        .returning({ id: profile.id });
      return inserted.length > 0;
    },

    async attachPhone(userId, phone) {
      const current = await loadById(userId);
      // The session resolved a live user; a null here means it vanished mid-request.
      if (!current) return { ok: false, error: "ALREADY_HAS_PHONE" };
      if (current.phone) return { ok: false, error: "ALREADY_HAS_PHONE" };
      const owner = await loadByPhone(phone);
      if (owner && owner.id !== userId) return { ok: false, error: "PHONE_ALREADY_LINKED" };
      try {
        await db
          .update(user)
          .set({ phone, phoneVerified: true, updatedAt: new Date() })
          .where(eq(user.id, userId));
      } catch {
        // Unique-violation race — the phone was claimed between the check and the write.
        return { ok: false, error: "PHONE_ALREADY_LINKED" };
      }
      const updated = await loadById(userId);
      return { ok: true, user: updated ?? { ...current, phone } };
    },

    async detachPhone(userId) {
      await db
        .update(user)
        .set({ phone: null, phoneVerified: false, updatedAt: new Date() })
        .where(eq(user.id, userId));
    },

    async updateProfile(userId, patch) {
      const set: { displayName?: string | null; avatarUrl?: string | null; updatedAt: Date } = {
        updatedAt: new Date(),
      };
      if (patch.displayName !== undefined) set.displayName = patch.displayName;
      if (patch.avatarUrl !== undefined) set.avatarUrl = patch.avatarUrl;
      await db.update(profile).set(set).where(eq(profile.userId, userId));
      // Re-read through the same join the rest of the repo uses so the caller gets
      // a consistent UserRecord (or null if the user disappeared).
      return loadById(userId);
    },

    async recordDevice(userId, info: DeviceInfo) {
      await db
        .insert(deviceTable)
        .values({
          id: randomUUID(),
          userId,
          platform: info.platform,
          deviceId: info.deviceId,
          model: info.model ?? null,
          osVersion: info.osVersion ?? null,
          appVersion: info.appVersion ?? null,
          pushToken: info.pushToken ?? null,
        })
        .onConflictDoUpdate({
          target: [deviceTable.userId, deviceTable.deviceId],
          set: {
            lastSeenAt: new Date(),
            model: info.model ?? null,
            osVersion: info.osVersion ?? null,
            appVersion: info.appVersion ?? null,
            pushToken: info.pushToken ?? null,
          },
        });
    },

    async recordLoginEvent(event: {
      userId: string | null;
      phone: string | null;
      platform: Platform;
      ip: string | null;
      deviceId?: string;
      success: boolean;
      reason?: string;
    }) {
      await db.insert(loginEvent).values({
        id: randomUUID(),
        userId: event.userId,
        phone: event.phone,
        platform: event.platform,
        ip: event.ip,
        success: event.success,
        reason: event.reason ?? null,
      });
    },

    async listDevices(userId) {
      const rows = await db
        .select()
        .from(deviceTable)
        .where(eq(deviceTable.userId, userId))
        .orderBy(desc(deviceTable.lastSeenAt));
      return rows.map((r) => ({
        id: r.id,
        platform: r.platform,
        deviceId: r.deviceId,
        model: r.model,
        osVersion: r.osVersion,
        appVersion: r.appVersion,
        lastSeenAt: r.lastSeenAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      }));
    },

    async updatePushToken(userId, deviceId, pushToken) {
      const updated = await db
        .update(deviceTable)
        .set({ pushToken, lastSeenAt: new Date() })
        .where(and(eq(deviceTable.userId, userId), eq(deviceTable.deviceId, deviceId)))
        .returning({ id: deviceTable.id });
      return updated.length > 0;
    },

    async listPushTokens(userId, platform) {
      const rows = await db
        .select({ deviceId: deviceTable.deviceId, pushToken: deviceTable.pushToken })
        .from(deviceTable)
        .where(and(eq(deviceTable.userId, userId), eq(deviceTable.platform, platform)));
      // Drop rows without a token; narrow `string | null` → `string` for the caller.
      return rows.flatMap((r) =>
        r.pushToken ? [{ deviceId: r.deviceId, pushToken: r.pushToken }] : [],
      );
    },

    async clearPushToken(userId, deviceId) {
      await db
        .update(deviceTable)
        .set({ pushToken: null })
        .where(and(eq(deviceTable.userId, userId), eq(deviceTable.deviceId, deviceId)));
    },

    async listLoginEvents(userId, limit = 10) {
      const rows = await db
        .select()
        .from(loginEvent)
        .where(eq(loginEvent.userId, userId))
        .orderBy(desc(loginEvent.createdAt))
        .limit(limit);
      return rows.map((r) => ({
        id: r.id,
        platform: r.platform,
        ip: r.ip,
        success: r.success,
        reason: r.reason,
        createdAt: r.createdAt.toISOString(),
      }));
    },
  };
}
