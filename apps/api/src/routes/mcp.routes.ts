import { createTodoSchema, type TodoDTO, updateTodoSchema } from "@infra/shared";
import { type Context, Hono } from "hono";
import type { TodoRepository as AppTodoRepository, TodoPatch, TodoRecord } from "./todo.routes.js";

export type { TodoPatch, TodoRecord };

export interface TodoRepository {
  list(userId: string): Promise<TodoRecord[]>;
  create(userId: string, input: { title: string }): Promise<TodoRecord>;
  update(userId: string, id: string, patch: TodoPatch): Promise<TodoRecord | null>;
  remove(userId: string, id: string): Promise<boolean>;
}

const MCP_PROTOCOL_VERSION = "2025-06-18";
const JSON_RPC_VERSION = "2.0";

const JSON_RPC_ERROR = {
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  unauthorized: -32001,
  forbidden: -32003,
} as const;

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: typeof JSON_RPC_VERSION;
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

interface JsonRpcErrorBody {
  jsonrpc: typeof JSON_RPC_VERSION;
  id: JsonRpcId;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface McpRouteDeps {
  todos: AppTodoRepository | TodoRepository;
  trustedOrigins: readonly string[];
  requireUser: (headers: Headers) => Promise<{ id: string } | null>;
}

const TODO_TOOLS = [
  {
    name: "infra_todo_list",
    title: "List Todos",
    description: "List the authenticated infra-lab user's todos, newest first.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "infra_todo_create",
    title: "Create Todo",
    description: "Create a todo for the authenticated infra-lab user.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          minLength: 1,
          maxLength: 200,
          description: "Todo title.",
        },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    name: "infra_todo_update",
    title: "Update Todo",
    description: "Update a todo title and/or completion state for the authenticated user.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1, description: "Todo id." },
        title: { type: "string", minLength: 1, maxLength: 200, description: "New title." },
        completed: { type: "boolean", description: "New completion state." },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "infra_todo_delete",
    title: "Delete Todo",
    description: "Delete a todo owned by the authenticated infra-lab user.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1, description: "Todo id." },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return typeof value === "string" || typeof value === "number" || value === null;
}

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

function rpcResult(id: JsonRpcId, result: unknown) {
  return { jsonrpc: JSON_RPC_VERSION, id, result };
}

function rpcError(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcErrorBody {
  return {
    jsonrpc: JSON_RPC_VERSION,
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  };
}

function textResult(id: JsonRpcId, structuredContent: Record<string, unknown>, isError = false) {
  return rpcResult(id, {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent,
    isError,
  });
}

function parseRpcMessage(value: unknown): JsonRpcRequest | null {
  if (!isRecord(value)) return null;
  if (value.jsonrpc !== JSON_RPC_VERSION || typeof value.method !== "string") return null;
  const message: JsonRpcRequest = { jsonrpc: JSON_RPC_VERSION, method: value.method };
  if ("id" in value) {
    const id = value.id;
    if (!isJsonRpcId(id)) return null;
    message.id = id;
  }
  if ("params" in value) message.params = value.params;
  return message;
}

function callParams(params: unknown): { name: string; args: Record<string, unknown> } | null {
  if (!isRecord(params) || typeof params.name !== "string") return null;
  const args = params.arguments;
  if (args === undefined) return { name: params.name, args: {} };
  return isRecord(args) ? { name: params.name, args } : null;
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

function originAllowed(origin: string | null, trustedOrigins: readonly string[]): boolean {
  return origin === null || trustedOrigins.includes(origin);
}

export function createMcpRoutes(_deps: McpRouteDeps): Hono {
  const deps = _deps;
  const app = new Hono();

  app.get("/mcp", (c) => c.body(null, 405));

  app.post("/mcp", async (c) => {
    const message = parseRpcMessage(await readJson(c));
    const id = message && "id" in message ? (message.id ?? null) : null;
    if (!message) {
      return c.json(rpcError(id, JSON_RPC_ERROR.invalidRequest, "Invalid JSON-RPC request"), 400);
    }

    if (!originAllowed(c.req.header("origin") ?? null, deps.trustedOrigins)) {
      return c.json(rpcError(id, JSON_RPC_ERROR.forbidden, "Untrusted origin"), 403);
    }

    const user = await deps.requireUser(c.req.raw.headers);
    if (!user) {
      return c.json(rpcError(id, JSON_RPC_ERROR.unauthorized, "Authentication required"), 401);
    }

    const requestId = message.id;
    if (requestId === undefined) return c.body(null, 202);

    if (message.method === "initialize") {
      return c.json(
        rpcResult(requestId, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "infra-lab", version: "0.1.0" },
        }),
      );
    }

    if (message.method === "tools/list") {
      return c.json(rpcResult(requestId, { tools: TODO_TOOLS }));
    }

    if (message.method === "tools/call") {
      const parsed = callParams(message.params);
      if (!parsed) {
        return c.json(
          rpcError(requestId, JSON_RPC_ERROR.invalidParams, "Invalid tools/call params"),
        );
      }

      const result = await callTodoTool(deps.todos, user.id, parsed.name, parsed.args, requestId);
      return c.json(result);
    }

    return c.json(
      rpcError(requestId, JSON_RPC_ERROR.methodNotFound, `Unknown MCP method: ${message.method}`),
    );
  });

  return app;
}

async function callTodoTool(
  todos: TodoRepository,
  userId: string,
  name: string,
  args: Record<string, unknown>,
  id: JsonRpcId,
) {
  if (name === "infra_todo_list") {
    const records = await todos.list(userId);
    const todoDtos = records.map(toTodoDTO);
    return textResult(id, { todos: todoDtos });
  }

  if (name === "infra_todo_create") {
    const parsed = createTodoSchema.safeParse(args);
    if (!parsed.success) {
      return rpcError(id, JSON_RPC_ERROR.invalidParams, "Invalid todo create arguments", {
        issues: parsed.error.issues,
      });
    }
    const todo = toTodoDTO(await todos.create(userId, parsed.data));
    return textResult(id, { todo });
  }

  if (name === "infra_todo_update") {
    if (typeof args.id !== "string" || args.id.length === 0) {
      return rpcError(id, JSON_RPC_ERROR.invalidParams, "Todo id is required");
    }
    const patch = updateTodoSchema.safeParse({
      title: args.title,
      completed: args.completed,
    });
    if (!patch.success) {
      return rpcError(id, JSON_RPC_ERROR.invalidParams, "Invalid todo update arguments", {
        issues: patch.error.issues,
      });
    }
    const updated = await todos.update(userId, args.id, patch.data);
    if (!updated) {
      return textResult(id, { code: "TODO_NOT_FOUND", message: "Todo not found" }, true);
    }
    return textResult(id, { todo: toTodoDTO(updated) });
  }

  if (name === "infra_todo_delete") {
    if (typeof args.id !== "string" || args.id.length === 0) {
      return rpcError(id, JSON_RPC_ERROR.invalidParams, "Todo id is required");
    }
    const deleted = await todos.remove(userId, args.id);
    if (!deleted) {
      return textResult(id, { deleted: false, code: "TODO_NOT_FOUND" }, true);
    }
    return textResult(id, { deleted: true });
  }

  return rpcError(id, JSON_RPC_ERROR.invalidParams, `Unknown tool: ${name}`);
}
