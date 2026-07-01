import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createTodoRoutes,
  type TodoPatch,
  type TodoRecord,
  type TodoRepository,
} from "../src/routes/todo.routes.js";

// undici's Response.json() is typed as unknown; tests assert on dynamic shapes.
const readJson = (res: Response): Promise<any> => res.json() as Promise<any>;

// ── In-memory, per-user todo repository ──────────────────────────────────────────
class FakeTodoRepository implements TodoRepository {
  rows = new Map<string, TodoRecord & { userId: string }>();

  private ownedRow(userId: string, id: string) {
    const row = this.rows.get(id);
    return row && row.userId === userId ? row : null;
  }

  async list(userId: string): Promise<TodoRecord[]> {
    return [...this.rows.values()]
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  async create(userId: string, input: { title: string }): Promise<TodoRecord> {
    const now = new Date();
    const row = {
      id: randomUUID(),
      userId,
      title: input.title,
      completed: false,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(row.id, row);
    return row;
  }
  async find(userId: string, id: string): Promise<TodoRecord | null> {
    return this.ownedRow(userId, id);
  }
  async update(userId: string, id: string, patch: TodoPatch): Promise<TodoRecord | null> {
    const row = this.ownedRow(userId, id);
    if (!row) return null;
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.completed !== undefined) {
      row.completed = patch.completed;
      row.completedAt = patch.completed ? new Date() : null;
    }
    row.updatedAt = new Date();
    return row;
  }
  async remove(userId: string, id: string): Promise<boolean> {
    const row = this.ownedRow(userId, id);
    if (!row) return false;
    this.rows.delete(id);
    return true;
  }
}

// A requireUser stub whose current user is switchable per test.
function fakeRequireUser(current: { id: string | null }) {
  return async () => (current.id ? { id: current.id } : null);
}

function setup() {
  const todos = new FakeTodoRepository();
  const current: { id: string | null } = { id: "user_a" };
  const app = createTodoRoutes({ todos, requireUser: fakeRequireUser(current) });
  return { app, todos, current };
}

function req(
  app: ReturnType<typeof createTodoRoutes>,
  method: string,
  path: string,
  body?: unknown,
) {
  return app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("todo routes — auth guard", () => {
  it("rejects every method with 401 UNAUTHORIZED when unauthenticated", async () => {
    const { app, current } = setup();
    current.id = null;
    for (const [method, path, body] of [
      ["GET", "/todos", undefined],
      ["POST", "/todos", { title: "x" }],
      ["PATCH", "/todos/abc", { completed: true }],
      ["DELETE", "/todos/abc", undefined],
    ] as const) {
      const res = await req(app, method, path, body);
      expect(res.status).toBe(401);
      expect((await readJson(res)).code).toBe("UNAUTHORIZED");
    }
  });
});

describe("POST /todos — validation", () => {
  it("rejects an empty title with 400 INVALID_REQUEST", async () => {
    const { app } = setup();
    const res = await req(app, "POST", "/todos", { title: "   " });
    expect(res.status).toBe(400);
    expect((await readJson(res)).code).toBe("INVALID_REQUEST");
  });

  it("rejects an over-long title with 400 INVALID_REQUEST", async () => {
    const { app } = setup();
    const res = await req(app, "POST", "/todos", { title: "a".repeat(201) });
    expect(res.status).toBe(400);
    expect((await readJson(res)).code).toBe("INVALID_REQUEST");
  });
});

describe("todo CRUD lifecycle", () => {
  it("creates, lists, completes (sets completedAt), then deletes", async () => {
    const { app } = setup();

    const created = await req(app, "POST", "/todos", { title: "买牛奶" });
    expect(created.status).toBe(201);
    const { todo } = await readJson(created);
    expect(todo.title).toBe("买牛奶");
    expect(todo.completed).toBe(false);
    expect(todo.completedAt).toBeNull();

    const listed = await readJson(await req(app, "GET", "/todos"));
    expect(listed.todos).toHaveLength(1);
    expect(listed.todos[0].id).toBe(todo.id);

    const patched = await req(app, "PATCH", `/todos/${todo.id}`, { completed: true });
    expect(patched.status).toBe(200);
    const done = (await readJson(patched)).todo;
    expect(done.completed).toBe(true);
    expect(done.completedAt).not.toBeNull();

    const del = await req(app, "DELETE", `/todos/${todo.id}`);
    expect(del.status).toBe(200);
    const after = await readJson(await req(app, "GET", "/todos"));
    expect(after.todos).toHaveLength(0);
  });

  it("clears completedAt when a todo is marked incomplete again", async () => {
    const { app } = setup();
    const { todo } = await readJson(await req(app, "POST", "/todos", { title: "x" }));
    await req(app, "PATCH", `/todos/${todo.id}`, { completed: true });
    const reopened = (
      await readJson(
        await req(app, "PATCH", `/todos/${todo.id}`, {
          completed: false,
        }),
      )
    ).todo;
    expect(reopened.completed).toBe(false);
    expect(reopened.completedAt).toBeNull();
  });
});

describe("owner isolation", () => {
  it("404s PATCH/DELETE for a missing id", async () => {
    const { app } = setup();
    const patch = await req(app, "PATCH", "/todos/nope", { completed: true });
    expect(patch.status).toBe(404);
    expect((await readJson(patch)).code).toBe("TODO_NOT_FOUND");
    const del = await req(app, "DELETE", "/todos/nope");
    expect(del.status).toBe(404);
  });

  it("never exposes another user's todo across list / patch / delete", async () => {
    const { app, current } = setup();
    // user_a creates a todo
    current.id = "user_a";
    const { todo } = await readJson(await req(app, "POST", "/todos", { title: "a-secret" }));

    // user_b cannot see, update, or delete it
    current.id = "user_b";
    const list = await readJson(await req(app, "GET", "/todos"));
    expect(list.todos).toHaveLength(0);
    expect((await req(app, "PATCH", `/todos/${todo.id}`, { completed: true })).status).toBe(404);
    expect((await req(app, "DELETE", `/todos/${todo.id}`)).status).toBe(404);

    // user_a still owns it, untouched
    current.id = "user_a";
    const back = await readJson(await req(app, "GET", "/todos"));
    expect(back.todos).toHaveLength(1);
    expect(back.todos[0].completed).toBe(false);
  });
});
