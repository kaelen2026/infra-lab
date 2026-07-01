"use client";

import type { TodoDTO } from "@infra/sdk";
import { Check, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TodoItemProps {
  todo: TodoDTO;
  pending: boolean;
  onToggle: (todo: TodoDTO) => void;
  onRemove: (id: string) => void;
}

/** One row: a round completion toggle, the title, and a delete action. */
export function TodoItem({ todo, pending, onToggle, onRemove }: TodoItemProps) {
  return (
    <li className="flex items-center gap-3 py-3">
      <button
        type="button"
        onClick={() => onToggle(todo)}
        disabled={pending}
        aria-pressed={todo.completed}
        aria-label={todo.completed ? "标记为未完成" : "标记为已完成"}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-50",
          todo.completed
            ? "border-primary bg-primary text-primary-foreground"
            : "border-input hover:border-primary",
        )}
      >
        {todo.completed && <Check className="size-3.5" />}
      </button>

      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm",
          todo.completed && "text-muted-foreground line-through",
        )}
      >
        {todo.title}
      </span>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => onRemove(todo.id)}
        disabled={pending}
        aria-label="删除"
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 />
      </Button>
    </li>
  );
}
