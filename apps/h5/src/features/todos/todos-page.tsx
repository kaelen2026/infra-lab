import { useSession } from "@/features/session";
import { AddTodoForm } from "./components/add-todo-form";
import { TodoList } from "./components/todo-list";
import { useTodos } from "./use-todos";

/** Todos tab: the first per-user business surface behind the login. */
export function TodosPage() {
  const { status } = useSession();
  const { todos, loading, error, creating, pendingIds, create, toggle, remove } = useTodos(
    status === "authenticated",
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-2xl font-medium">待办</h1>
        <p className="mt-1 text-sm text-muted-foreground">按用户隔离的待办清单。</p>
      </header>

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
  );
}
