import { randomUUID } from "node:crypto";
import { type Db, device as deviceTable, loginEvent, profile, user } from "@infra/db";
import type { DeviceInfo, Platform } from "@infra/shared";
import { eq } from "drizzle-orm";
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
      phone: row.user.phone ?? phone,
      displayName: row.profile?.displayName ?? null,
      avatarUrl: row.profile?.avatarUrl ?? null,
      createdAt: row.user.createdAt,
    };
  }

  return {
    findByPhone: loadByPhone,

    async createWithProfile(phone) {
      const id = randomUUID();
      const now = new Date();
      await db.transaction(async (tx) => {
        await tx
          .insert(user)
          .values({ id, phone, phoneVerified: true, createdAt: now, updatedAt: now });
        await tx.insert(profile).values({ id: randomUUID(), userId: id });
      });
      return { id, phone, displayName: null, avatarUrl: null, createdAt: now };
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
      userId: string;
      phone: string;
      platform: Platform;
      ip: string;
      deviceId?: string;
      success: boolean;
    }) {
      await db.insert(loginEvent).values({
        id: randomUUID(),
        userId: event.userId,
        phone: event.phone,
        platform: event.platform,
        ip: event.ip,
        success: event.success,
      });
    },
  };
}
