/**
 * ArkTS mirror of `@infra/shared`'s todo contracts
 * (`packages/shared/src/contracts/todo.ts`) — the single source of truth shared by
 * the API and all four clients (web / ios / android / harmony).
 *
 * HarmonyOS can't import the TS package directly, so these shapes are hand-mirrored.
 * Keep field names byte-for-byte identical to the server DTOs: they are the JSON wire
 * format. If the shared contract changes, change this file in the same PR.
 */

/** Max title length accepted by the server (mirrors `titleSchema.max(200)`). */
export const TITLE_MAX_LENGTH: number = 200;

/** Every todo is scoped to the authenticated user. */
export interface TodoDTO {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  /** ISO 8601, null while not completed. */
  completedAt: string | null;
}

export interface CreateTodoInput {
  title: string;
}

/** Partial update — at least one field must be present. */
export interface UpdateTodoInput {
  title?: string;
  completed?: boolean;
}

/** Stable, client-switchable error codes (mirrors TODO_ERROR_CODES). */
export type TodoErrorCode = "INVALID_REQUEST" | "UNAUTHORIZED" | "TODO_NOT_FOUND";

export interface TodosResponse {
  ok: boolean;
  todos: TodoDTO[];
}

export interface TodoResponse {
  ok: boolean;
  todo: TodoDTO;
}

export interface TodoRoutes {
  list: string;
  create: string;
}

/** Endpoint paths — never hard-code strings elsewhere. */
export const TODO_ROUTES: TodoRoutes = {
  list: "/todos",
  create: "/todos",
};

/** Path for a single todo (update / delete). */
export function todoPath(id: string): string {
  return `/todos/${id}`;
}
