import {
  createTodoSchema,
  type TodoDTO,
  type TodoErrorCode,
  updateTodoSchema,
} from "@infra/shared";
import { type Context, Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

// ── Ports the routes depend on (implemented in src/services with db) ─────────────
export interface TodoRecord {
  id: string;
  title: string;
  completed: boolean;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A validated update patch — at least one field is present (see updateTodoSchema). */
export interface TodoPatch {
  title?: string;
  completed?: boolean;
}

/**
 * Every method takes the owner's `userId`; the repository enforces per-user
 * isolation so a caller can never read or mutate another user's todos.
 */
export interface TodoRepository {
  list(userId: string): Promise<TodoRecord[]>;
  create(userId: string, input: { title: string }): Promise<TodoRecord>;
  find(userId: string, id: string): Promise<TodoRecord | null>;
  update(userId: string, id: string, patch: TodoPatch): Promise<TodoRecord | null>;
  /** Returns whether a row was actually deleted (false ⇒ missing / not owner). */
  remove(userId: string, id: string): Promise<boolean>;
}

export interface TodoRouteDeps {
  todos: TodoRepository;
  /** Resolve the current user from Cookie or Bearer (null when unauthenticated). */
  requireUser: (headers: Headers) => Promise<{ id: string } | null>;
}

const ERROR_STATUS: Record<TodoErrorCode, ContentfulStatusCode> = {
  INVALID_REQUEST: 400,
  UNAUTHORIZED: 401,
  TODO_NOT_FOUND: 404,
};

function toTodoDTO(record: TodoRecord): TodoDTO {
  return {
    id: record.id,
    title: record.title,
    completed: record.completed,
    completedAt: record.completedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function createTodoRoutes(deps: TodoRouteDeps): Hono {
  const { todos, requireUser } = deps;
  const app = new Hono();

  const fail = (c: Context, code: TodoErrorCode, extra: Record<string, unknown> = {}) =>
    c.json({ ok: false, code, ...extra }, ERROR_STATUS[code]);

  async function readJson(c: Context): Promise<unknown> {
    try {
      return await c.req.json();
    } catch {
      return undefined;
    }
  }

  // ── List the current user's todos ───────────────────────────────────────────
  app.get("/todos", async (c) => {
    const user = await requireUser(c.req.raw.headers);
    if (!user) return fail(c, "UNAUTHORIZED");
    const records = await todos.list(user.id);
    return c.json({ ok: true, todos: records.map(toTodoDTO) });
  });

  // ── Create a todo ─────────────────────────────────────────────────────────────
  app.post("/todos", async (c) => {
    const user = await requireUser(c.req.raw.headers);
    if (!user) return fail(c, "UNAUTHORIZED");

    const parsed = createTodoSchema.safeParse(await readJson(c));
    if (!parsed.success) return fail(c, "INVALID_REQUEST", { issues: parsed.error.issues });

    const record = await todos.create(user.id, parsed.data);
    return c.json({ ok: true, todo: toTodoDTO(record) }, 201);
  });

  // ── Update a todo (title and/or completed) ────────────────────────────────────
  // Registered for both PATCH and PUT: HarmonyOS's NetworkKit `http.RequestMethod`
  // enum has no PATCH member, so the harmony client updates via PUT. Same handler,
  // same semantics (partial update) for every client.
  const handleUpdate = async (c: Context, id: string) => {
    const user = await requireUser(c.req.raw.headers);
    if (!user) return fail(c, "UNAUTHORIZED");

    const parsed = updateTodoSchema.safeParse(await readJson(c));
    if (!parsed.success) return fail(c, "INVALID_REQUEST", { issues: parsed.error.issues });

    const record = await todos.update(user.id, id, parsed.data);
    if (!record) return fail(c, "TODO_NOT_FOUND");
    return c.json({ ok: true, todo: toTodoDTO(record) });
  };
  app.patch("/todos/:id", (c) => handleUpdate(c, c.req.param("id")));
  app.put("/todos/:id", (c) => handleUpdate(c, c.req.param("id")));

  // ── Delete a todo ─────────────────────────────────────────────────────────────
  app.delete("/todos/:id", async (c) => {
    const user = await requireUser(c.req.raw.headers);
    if (!user) return fail(c, "UNAUTHORIZED");

    const removed = await todos.remove(user.id, c.req.param("id"));
    if (!removed) return fail(c, "TODO_NOT_FOUND");
    return c.json({ ok: true });
  });

  return app;
}
