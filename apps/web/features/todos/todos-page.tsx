"use client";

import { AppNav } from "@/components/app-nav";
import { useRequireAuth } from "@/features/session";
import { AddTodoForm } from "./components/add-todo-form";
import { TodoList } from "./components/todo-list";
import { useTodos } from "./use-todos";

/**
 * Protected todo list. Like the dashboard, the session lives behind the API
 * (cookie), so the guard is client-side (see {@link useRequireAuth}).
 */
export default function TodosPage() {
  const { ready } = useRequireAuth();
  const { todos, loading, error, creating, pendingIds, create, toggle, remove } = useTodos(ready);

  // Hold the layout (with nav) while resolving / redirecting, so there's no flash.
  if (!ready) {
    return (
      <>
        <AppNav />
        <main className="mx-auto max-w-3xl px-4 py-10" />
      </>
    );
  }

  return (
    <>
      <AppNav />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <header className="mb-8">
          <h1 className="font-serif text-3xl font-medium">待办</h1>
          <p className="mt-1 text-muted-foreground">登录之后的第一个业务:按用户隔离的待办清单。</p>
        </header>

        <div className="space-y-6">
          <AddTodoForm onAdd={create} busy={creating} />

          <TodoList
            todos={todos}
            loading={loading}
            pendingIds={pendingIds}
            onToggle={toggle}
            onRemove={remove}
          />

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </div>
      </main>
    </>
  );
}
