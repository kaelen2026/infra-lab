import { randomUUID } from "node:crypto";
import { type Db, timelinePost } from "@infra/db";
import { and, desc, eq, lt, or } from "drizzle-orm";
import type { TimelinePostRepository } from "../routes/timeline.routes.js";

/** Drizzle-backed {@link TimelinePostRepository}. Every query is scoped by `userId`. */
export function createTimelineRepository(db: Db): TimelinePostRepository {
  /** Rows are owned by exactly one user; scope every read/write to (userId, ...). */
  const owned = (userId: string, id: string) =>
    and(eq(timelinePost.userId, userId), eq(timelinePost.id, id));

  return {
    async list(userId, { limit, before }) {
      // Keyset on (created_at, id) DESC: `before` is the last row of the previous
      // page; ties on created_at fall back to id so the order is total and a
      // page boundary never skips or repeats a row.
      const olderThan = before
        ? or(
            lt(timelinePost.createdAt, before.createdAt),
            and(eq(timelinePost.createdAt, before.createdAt), lt(timelinePost.id, before.id)),
          )
        : undefined;
      return db
        .select()
        .from(timelinePost)
        .where(and(eq(timelinePost.userId, userId), olderThan))
        .orderBy(desc(timelinePost.createdAt), desc(timelinePost.id))
        .limit(limit);
    },

    async create(userId, input) {
      const [row] = await db
        .insert(timelinePost)
        .values({ id: randomUUID(), userId, text: input.text, images: input.images })
        .returning();
      // A single-row insert always returns exactly one row.
      if (!row) throw new Error("timeline post insert returned no row");
      return row;
    },

    async remove(userId, id) {
      const rows = await db
        .delete(timelinePost)
        .where(owned(userId, id))
        .returning({ id: timelinePost.id });
      return rows.length > 0;
    },
  };
}
