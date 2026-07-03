import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth.js";

/** A reference to an uploaded image (relative url the API issued). */
export interface TimelineImageRef {
  url: string;
}

/**
 * A per-user timeline post — text and/or a list of uploaded image references.
 * Images are stored in the `images` jsonb column as the urls the upload endpoint
 * issued; the bytes live on disk (local-directory storage, first cut).
 */
export const timelinePost = pgTable(
  "timeline_post",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    text: text("text").notNull().default(""),
    images: jsonb("images").$type<TimelineImageRef[]>().notNull(),
    // Millisecond precision: the list cursor is keyset on (created_at, id) and
    // round-trips created_at through a JS Date (ms). Microsecond storage would
    // make the cursor comparison skip rows that share a millisecond.
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (t) => [
    index("timeline_post_user_id_idx").on(t.userId),
    // Serves the keyset list query: WHERE user_id = ? [AND (created_at, id) < ?]
    // ORDER BY created_at DESC, id DESC.
    index("timeline_post_user_created_id_idx").on(t.userId, t.createdAt.desc(), t.id.desc()),
  ],
);

export const timelinePostRelations = relations(timelinePost, ({ one }) => ({
  user: one(user, { fields: [timelinePost.userId], references: [user.id] }),
}));

export type TimelinePost = typeof timelinePost.$inferSelect;
export type NewTimelinePost = typeof timelinePost.$inferInsert;
