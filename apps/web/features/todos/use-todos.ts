"use client";

import type { TodoDTO } from "@infra/sdk";
import { useCallback, useEffect, useState } from "react";

import { todoClient } from "@/lib/todo-client";

export interface UseTodos {
  todos: TodoDTO[] | null;
  loading: boolean;
  error: string | null;
  /** True while a create is in flight (disables the add form). */
  creating: boolean;
  /** Ids with a toggle/delete in flight (disables that row). */
  pendingIds: Set<string>;
  create: (title: string) => Promise<void>;
  toggle: (todo: TodoDTO) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/**
 * Owns the current user's todo list plus its create/toggle/delete mutations.
 * Mutations update local state from the server's returned DTO (no full re-fetch),
 * keeping the list authoritative without a flash.
 */
export function useTodos(enabled: boolean): UseTodos {
  const [todos, setTodos] = useState<TodoDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    (async () => {
      try {
        const list = await todoClient.list();
        if (active) setTodos(list);
      } catch {
        if (active) setError("无法加载待办，请稍后重试。");
      }
    })();
    return () => {
      active = false;
    };
  }, [enabled]);

  const withPending = useCallback(async (id: string, fn: () => Promise<void>) => {
    setPendingIds((prev) => new Set(prev).add(id));
    try {
      await fn();
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const create = useCallback(async (title: string) => {
    setError(null);
    setCreating(true);
    try {
      const created = await todoClient.create({ title });
      // List is newest-first; the new item leads.
      setTodos((prev) => [created, ...(prev ?? [])]);
    } catch {
      setError("创建失败，请重试。");
    } finally {
      setCreating(false);
    }
  }, []);

  const toggle = useCallback(
    (todo: TodoDTO) =>
      withPending(todo.id, async () => {
        setError(null);
        try {
          const updated = await todoClient.toggle(todo.id, !todo.completed);
          setTodos((prev) => prev?.map((t) => (t.id === updated.id ? updated : t)) ?? null);
        } catch {
          setError("更新失败,请重试。");
        }
      }),
    [withPending],
  );

  const remove = useCallback(
    (id: string) =>
      withPending(id, async () => {
        setError(null);
        try {
          await todoClient.remove(id);
          setTodos((prev) => prev?.filter((t) => t.id !== id) ?? null);
        } catch {
          setError("删除失败,请重试。");
        }
      }),
    [withPending],
  );

  return {
    todos,
    loading: enabled && !error && todos === null,
    error,
    creating,
    pendingIds,
    create,
    toggle,
    remove,
  };
}
