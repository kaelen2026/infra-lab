"use client";

import {
  TIMELINE_IMAGE_CONTENT_TYPES,
  type TimelineImage,
  type TimelineImageContentType,
  type TimelinePostDTO,
} from "@infra/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { describeError } from "@/lib/errors";
import { timelineClient } from "@/lib/timeline-client";

/** The payload the composer hands to {@link UseTimeline.publish}. */
export interface PublishInput {
  text: string;
  files: File[];
}

export interface UseTimeline {
  posts: TimelinePostDTO[] | null;
  loading: boolean;
  error: string | null;
  /** True while a publish (image upload + create) is in flight. */
  publishing: boolean;
  /** Ids with a delete in flight (disables that card). */
  pendingIds: Set<string>;
  publish: (input: PublishInput) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const TIMELINE_KEY = ["timeline"] as const;

function isAllowedType(value: string): value is TimelineImageContentType {
  return (TIMELINE_IMAGE_CONTENT_TYPES as readonly string[]).includes(value);
}

/**
 * Owns the current user's timeline feed plus its publish/delete mutations, backed
 * by TanStack Query (mirrors {@link useTodos}). The list is a cached query
 * (`["timeline"]`); mutations write the server's returned DTO straight into the
 * cache. Publish is two steps — upload each image, then create the post
 * referencing the returned urls — matching the API's two-step contract.
 */
export function useTimeline(enabled: boolean): UseTimeline {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const query = useQuery({
    queryKey: TIMELINE_KEY,
    queryFn: () => timelineClient.list(),
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

  const publishMutation = useMutation({
    mutationFn: async ({ text, files }: PublishInput) => {
      const images: TimelineImage[] = [];
      for (const file of files) {
        if (!isAllowedType(file.type)) throw new Error("unsupported image type");
        const bytes = new Uint8Array(await file.arrayBuffer());
        const uploaded = await timelineClient.uploadImage(bytes, file.type);
        images.push({ url: uploaded.url });
      }
      return timelineClient.create({ text, images });
    },
    onMutate: () => setActionError(null),
    onSuccess: (created) => {
      // Feed is newest-first; the new post leads.
      queryClient.setQueryData<TimelinePostDTO[]>(TIMELINE_KEY, (prev) => [
        created,
        ...(prev ?? []),
      ]);
    },
    onError: (err) => setActionError(describeError(err, "发布失败，请重试。")),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => timelineClient.remove(id),
    onMutate: (id) => {
      setActionError(null);
      addPending(id);
    },
    onSuccess: (_data, id) => {
      queryClient.setQueryData<TimelinePostDTO[]>(
        TIMELINE_KEY,
        (prev) => prev?.filter((p) => p.id !== id) ?? prev,
      );
    },
    onError: (err) => setActionError(describeError(err, "删除失败，请重试。")),
    onSettled: (_data, _err, id) => removePending(id),
  });

  // Mutations swallow their rejection here: errors surface via `error`, and callers
  // (composer / cards) treat the action as settled either way — matching useTodos.
  const publish = useCallback(
    (input: PublishInput) => publishMutation.mutateAsync(input).then(noop, noop),
    [publishMutation],
  );
  const remove = useCallback(
    (id: string) => removeMutation.mutateAsync(id).then(noop, noop),
    [removeMutation],
  );

  return {
    posts: query.data ?? null,
    loading: query.isLoading,
    error: actionError ?? (query.isError ? "无法加载动态，请稍后重试。" : null),
    publishing: publishMutation.isPending,
    pendingIds,
    publish,
    remove,
  };
}

function noop(): void {}
