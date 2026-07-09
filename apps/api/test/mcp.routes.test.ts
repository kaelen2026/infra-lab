import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createMcpRoutes,
  type McpRouteDeps,
  type TodoPatch,
  type TodoRecord,
  type TodoRepository,
} from "../src/routes/mcp.routes.js";

const readJson = (res: Response): Promise<any> => res.json() as Promise<any>;

class FakeTodoRepository implements TodoRepository {
  rows = new Map<string, TodoRecord & { userId: string }>();

  async list(userId: string): Promise<TodoRecord[]> {
    return [...this.rows.values()]
      .filter((row) => row.userId === userId)
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

  async update(userId: string, id: string, patch: TodoPatch): Promise<TodoRecord | null> {
    const row = this.rows.get(id);
    if (!row || row.userId !== userId) return null;
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.completed !== undefined) {
      row.completed = patch.completed;
      row.completedAt = patch.completed ? new Date() : null;
    }
    row.updatedAt = new Date();
    return row;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.userId !== userId) return false;
    this.rows.delete(id);
    return true;
  }
}

function setup() {
  const todos = new FakeTodoRepository();
  const current: { id: string | null } = { id: "user_a" };
  const deps: McpRouteDeps = {
    todos,
    trustedOrigins: ["https://app.example.test"],
    requireUser: async () => (current.id ? { id: current.id } : null),
  };
  const app = createMcpRoutes(deps);
  return { app, todos, current };
}

function rpc(id: number | string, method: string, params?: unknown) {
  return { jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) };
}

function mcpPost(
  app: ReturnType<typeof createMcpRoutes>,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return app.request("/mcp", {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("MCP route transport guards", () => {
  it("rejects unauthenticated JSON-RPC requests with 401", async () => {
    const { app, current } = setup();
    current.id = null;

    const res = await mcpPost(app, rpc(1, "initialize"));

    expect(res.status).toBe(401);
    const body = await readJson(res);
    expect(body.error.code).toBe(-32001);
  });

  it("rejects browser requests from untrusted origins", async () => {
    const { app } = setup();

    const res = await mcpPost(app, rpc(1, "initialize"), {
      origin: "https://evil.example.test",
    });

    expect(res.status).toBe(403);
    const body = await readJson(res);
    expect(body.error.code).toBe(-32003);
  });

  it("returns 202 for accepted client notifications", async () => {
    const { app } = setup();

    const res = await mcpPost(app, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });

    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it("does not open a server-initiated SSE stream", async () => {
    const { app } = setup();

    const res = await app.request("/mcp", {
      method: "GET",
      headers: { accept: "text/event-stream" },
    });

    expect(res.status).toBe(405);
  });
});

describe("MCP lifecycle and todo tools", () => {
  it("initializes with tool capability metadata", async () => {
    const { app } = setup();

    const res = await mcpPost(
      app,
      rpc(1, "initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "vitest", version: "1.0.0" },
      }),
      { origin: "https://app.example.test" },
    );

    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.result.protocolVersion).toBe("2025-06-18");
    expect(body.result.capabilities.tools).toEqual({ listChanged: false });
    expect(body.result.serverInfo.name).toBe("infra-lab");
  });

  it("lists the supported todo tools", async () => {
    const { app } = setup();

    const res = await mcpPost(app, rpc(2, "tools/list"));

    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "infra_todo_list",
      "infra_todo_create",
      "infra_todo_update",
      "infra_todo_delete",
    ]);
    expect(body.result.tools[1].inputSchema.required).toEqual(["title"]);
  });

  it("creates, lists, updates, and deletes the caller's todos through tools/call", async () => {
    const { app } = setup();

    const created = await readJson(
      await mcpPost(
        app,
        rpc(3, "tools/call", {
          name: "infra_todo_create",
          arguments: { title: "Ship MCP" },
        }),
      ),
    );
    expect(created.result.isError).toBe(false);
    expect(created.result.structuredContent.todo.title).toBe("Ship MCP");
    const id: string = created.result.structuredContent.todo.id;

    const listed = await readJson(
      await mcpPost(app, rpc(4, "tools/call", { name: "infra_todo_list", arguments: {} })),
    );
    expect(listed.result.structuredContent.todos).toHaveLength(1);
    expect(listed.result.content[0].text).toContain("Ship MCP");

    const updated = await readJson(
      await mcpPost(
        app,
        rpc(5, "tools/call", {
          name: "infra_todo_update",
          arguments: { id, completed: true },
        }),
      ),
    );
    expect(updated.result.structuredContent.todo.completed).toBe(true);
    expect(updated.result.structuredContent.todo.completedAt).not.toBeNull();

    const deleted = await readJson(
      await mcpPost(
        app,
        rpc(6, "tools/call", {
          name: "infra_todo_delete",
          arguments: { id },
        }),
      ),
    );
    expect(deleted.result.structuredContent.deleted).toBe(true);
  });

  it("returns JSON-RPC invalid params for malformed tool arguments", async () => {
    const { app } = setup();

    const res = await mcpPost(
      app,
      rpc(7, "tools/call", {
        name: "infra_todo_create",
        arguments: { title: "   " },
      }),
    );

    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.error.code).toBe(-32602);
  });
});
