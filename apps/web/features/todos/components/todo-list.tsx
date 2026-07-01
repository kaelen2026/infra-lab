import type { TodoDTO } from "@infra/sdk";
import { ListTodo } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TodoItem } from "./todo-item";

interface TodoListProps {
  todos: TodoDTO[] | null;
  loading: boolean;
  pendingIds: Set<string>;
  onToggle: (todo: TodoDTO) => void;
  onRemove: (id: string) => void;
}

/** The list body: skeleton while loading, an empty state, or the divided rows. */
export function TodoList({ todos, loading, pendingIds, onToggle, onRemove }: TodoListProps) {
  return (
    <Card>
      <CardContent>
        {loading ? (
          <div className="space-y-3 py-1">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        ) : todos && todos.length > 0 ? (
          <ul className="divide-y divide-border/60">
            {todos.map((t) => (
              <TodoItem
                key={t.id}
                todo={t}
                pending={pendingIds.has(t.id)}
                onToggle={onToggle}
                onRemove={onRemove}
              />
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <ListTodo className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">还没有待办,在上面添加第一项吧。</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
