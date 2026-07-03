import type { AuthClient, TodoClient } from "@infra/sdk";
import { withRefresh } from "../client.js";
import type { CliIO } from "../io.js";

export interface TodoCommandDeps {
  auth: AuthClient;
  todo: TodoClient;
  io: CliIO;
}

/** List the current user's todos, newest first as the API returns them. */
export async function runTodoList(deps: TodoCommandDeps): Promise<number> {
  const { auth, todo, io } = deps;
  const todos = await withRefresh(auth, () => todo.list());
  if (todos.length === 0) {
    io.print("(暂无待办)");
    return 0;
  }
  for (const t of todos) {
    io.print(`${t.completed ? "[x]" : "[ ]"} ${t.id}  ${t.title}`);
  }
  return 0;
}

/** Create a todo from the provided title. */
export async function runTodoAdd(deps: TodoCommandDeps, title: string): Promise<number> {
  const { auth, todo, io } = deps;
  const created = await withRefresh(auth, () => todo.create({ title }));
  io.print(`已创建:${created.id}  ${created.title}`);
  return 0;
}

/** Mark a todo complete by id. */
export async function runTodoDone(deps: TodoCommandDeps, id: string): Promise<number> {
  const { auth, todo, io } = deps;
  const updated = await withRefresh(auth, () => todo.toggle(id, true));
  io.print(`已完成:${updated.id}  ${updated.title}`);
  return 0;
}

/** Delete a todo by id. */
export async function runTodoRemove(deps: TodoCommandDeps, id: string): Promise<number> {
  const { auth, todo, io } = deps;
  await withRefresh(auth, () => todo.remove(id));
  io.print(`已删除:${id}`);
  return 0;
}
