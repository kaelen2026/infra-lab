import { type Db, loginEvent, profile, timelinePost, todo, user } from "@infra/db";
import { and, count, desc, eq, gte } from "drizzle-orm";
import type { AdminRepository, AdminUserRecord } from "../routes/admin.routes.js";

/** Drizzle-backed {@link AdminRepository} — cross-user aggregates for the admin console. */
export function createAdminRepository(db: Db): AdminRepository {
  return {
    async countUsers() {
      const [row] = await db.select({ value: count() }).from(user);
      return row?.value ?? 0;
    },

    async countTodos() {
      const [row] = await db.select({ value: count() }).from(todo);
      return row?.value ?? 0;
    },

    async countTimelinePosts() {
      const [row] = await db.select({ value: count() }).from(timelinePost);
      return row?.value ?? 0;
    },

    async countLoginEventsSince(since: Date, success: boolean) {
      const [row] = await db
        .select({ value: count() })
        .from(loginEvent)
        .where(and(gte(loginEvent.createdAt, since), eq(loginEvent.success, success)));
      return row?.value ?? 0;
    },

    async listUsers(limit: number, offset: number): Promise<AdminUserRecord[]> {
      const rows = await db
        .select({
          id: user.id,
          phone: user.phone,
          displayName: profile.displayName,
          createdAt: user.createdAt,
        })
        .from(user)
        .leftJoin(profile, eq(profile.userId, user.id))
        .orderBy(desc(user.createdAt))
        .limit(limit)
        .offset(offset);
      return rows.map((r) => ({
        id: r.id,
        phone: r.phone,
        displayName: r.displayName ?? null,
        createdAt: r.createdAt,
      }));
    },
  };
}
