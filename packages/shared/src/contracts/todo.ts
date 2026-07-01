import { z } from "zod";

/**
 * Todo contracts shared by the API and all four client SDKs (web / ios / android / harmony).
 * Mirrors the auth contracts: the single source of truth for request/response shapes,
 * error codes and limits. Every todo is scoped to the authenticated user.
 */

// ── Title ───────────────────────────────────────────────────────────────────
export const titleSchema = z.string().trim().min(1).max(200);

// ── Requests ──────────────────────────────────────────────────────────────────
export const createTodoSchema = z.object({ title: titleSchema });
export type CreateTodoInput = z.infer<typeof createTodoSchema>;

/** Partial update — at least one field must be present. */
export const updateTodoSchema = z
  .object({
    title: titleSchema.optional(),
    completed: z.boolean().optional(),
  })
  .refine((v) => v.title !== undefined || v.completed !== undefined, {
    message: "at least one of title or completed is required",
  });
export type UpdateTodoInput = z.infer<typeof updateTodoSchema>;

// ── DTO ─────────────────────────────────────────────────────────────────────
export interface TodoDTO {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  completedAt: string | null; // ISO 8601, null while not completed
}

// ── Error codes (stable, client-switchable) ───────────────────────────────────
export const TODO_ERROR_CODES = [
  "INVALID_REQUEST",
  "UNAUTHORIZED", // no/invalid session for a protected route
  "TODO_NOT_FOUND", // missing, or owned by another user
] as const;
export type TodoErrorCode = (typeof TODO_ERROR_CODES)[number];

export interface TodoError {
  code: TodoErrorCode;
  message: string;
}

// ── Responses ─────────────────────────────────────────────────────────────────
export interface TodosResponse {
  ok: true;
  todos: TodoDTO[];
}

export interface TodoResponse {
  ok: true;
  todo: TodoDTO;
}

// ── Endpoint paths (shared so SDKs never hard-code strings) ─────────────────────
export const TODO_ROUTES = {
  list: "/todos",
  create: "/todos",
} as const;

/** Path for a single todo (update / delete). */
export function todoPath(id: string): string {
  return `/todos/${id}`;
}

// ── SDK interface draft (implemented per platform) ─────────────────────────────
/**
 * The shape every platform SDK implements. Transport mirrors {@link AuthClient}:
 * web rides the HttpOnly session cookie; native sends `Authorization: Bearer`.
 */
export interface TodoClient {
  list(): Promise<TodoDTO[]>;
  create(input: CreateTodoInput): Promise<TodoDTO>;
  update(id: string, patch: UpdateTodoInput): Promise<TodoDTO>;
  /** Convenience over {@link update} for the common completed toggle. */
  toggle(id: string, completed: boolean): Promise<TodoDTO>;
  remove(id: string): Promise<void>;
}
