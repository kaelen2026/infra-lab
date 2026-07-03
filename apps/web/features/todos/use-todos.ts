"use client";

import type { TodoDTO } from "@infra/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { describeError } from "@/lib/errors";
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

const TODOS_KEY = ["todos"] as const;

/**
 * Owns the current user's todo list plus its create/toggle/delete mutations,
 * backed by TanStack Query. The list is a cached query (`["todos"]`); mutations
 * write the server's returned DTO straight into the cache (no full re-fetch),
 * keeping the list authoritative without a flash.
 */
export function useTodos(enabled: boolean): UseTodos {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const query = useQuery({
    queryKey: TODOS_KEY,
    queryFn: () => todoClient.list(),
    enabled,
  });

  const addPending = useCallback((id: string) => {
    setPendingIds((prev) => new Set(prev).add(id));
  }, []);

  const removePending = useCallback((id: string) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const createMutation = useMutation({
    mutationFn: (title: string) => todoClient.create({ title }),
    onMutate: () => setActionError(null),
    onSuccess: (created) => {
      // List is newest-first; the new item leads.
      queryClient.setQueryData<TodoDTO[]>(TODOS_KEY, (prev) => [created, ...(prev ?? [])]);
    },
    onError: (err) => setActionError(describeError(err, "创建失败，请重试。")),
  });

  const toggleMutation = useMutation({
    mutationFn: (todo: TodoDTO) => todoClient.toggle(todo.id, !todo.completed),
    onMutate: (todo) => {
      setActionError(null);
      addPending(todo.id);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<TodoDTO[]>(
        TODOS_KEY,
        (prev) => prev?.map((t) => (t.id === updated.id ? updated : t)) ?? prev,
      );
    },
    onError: (err) => setActionError(describeError(err, "更新失败，请重试。")),
    onSettled: (_data, _err, todo) => removePending(todo.id),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => todoClient.remove(id),
    onMutate: (id) => {
      setActionError(null);
      addPending(id);
    },
    onSuccess: (_data, id) => {
      queryClient.setQueryData<TodoDTO[]>(
        TODOS_KEY,
        (prev) => prev?.filter((t) => t.id !== id) ?? prev,
      );
    },
    onError: (err) => setActionError(describeError(err, "删除失败，请重试。")),
    onSettled: (_data, _err, id) => removePending(id),
  });

  // Mutations swallow their rejection here: errors surface via `error`, and callers
  // (forms/rows) treat the action as settled either way — as before the migration.
  const create = useCallback(
    (title: string) => createMutation.mutateAsync(title).then(noop, noop),
    [createMutation],
  );
  const toggle = useCallback(
    (todo: TodoDTO) => toggleMutation.mutateAsync(todo).then(noop, noop),
    [toggleMutation],
  );
  const remove = useCallback(
    (id: string) => removeMutation.mutateAsync(id).then(noop, noop),
    [removeMutation],
  );

  return {
    todos: query.data ?? null,
    loading: query.isLoading,
    error: actionError ?? (query.isError ? "无法加载待办，请稍后重试。" : null),
    creating: createMutation.isPending,
    pendingIds,
    create,
    toggle,
    remove,
  };
}

function noop(): void {}
