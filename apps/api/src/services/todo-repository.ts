import { randomUUID } from "node:crypto";
import { type Db, todo } from "@infra/db";
import { and, desc, eq } from "drizzle-orm";
import type { TodoPatch, TodoRepository } from "../routes/todo.routes.js";

/** Drizzle-backed {@link TodoRepository}. Every query is scoped by `userId`. */
export function createTodoRepository(db: Db): TodoRepository {
  /** Rows are owned by exactly one user; scope every read/write to (userId, ...). */
  const owned = (userId: string, id: string) => and(eq(todo.userId, userId), eq(todo.id, id));

  return {
    async list(userId) {
      return db.select().from(todo).where(eq(todo.userId, userId)).orderBy(desc(todo.createdAt));
    },

    async create(userId, input) {
      const [row] = await db
        .insert(todo)
        .values({ id: randomUUID(), userId, title: input.title })
        .returning();
      // A single-row insert always returns exactly one row.
      if (!row) throw new Error("todo insert returned no row");
      return row;
    },

    async find(userId, id) {
      const rows = await db.select().from(todo).where(owned(userId, id)).limit(1);
      return rows[0] ?? null;
    },

    async update(userId, id, patch: TodoPatch) {
      const set: Partial<typeof todo.$inferInsert> = { updatedAt: new Date() };
      if (patch.title !== undefined) set.title = patch.title;
      if (patch.completed !== undefined) {
        set.completed = patch.completed;
        // Keep completedAt in lockstep with the completed flag.
        set.completedAt = patch.completed ? new Date() : null;
      }
      const [row] = await db.update(todo).set(set).where(owned(userId, id)).returning();
      return row ?? null;
    },

    async remove(userId, id) {
      const rows = await db.delete(todo).where(owned(userId, id)).returning({ id: todo.id });
      return rows.length > 0;
    },
  };
}
