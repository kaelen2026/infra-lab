"use client";

import {
  TIMELINE_IMAGE_CONTENT_TYPES,
  type TimelineImage,
  type TimelineImageContentType,
  type TimelinePage,
  type TimelinePostDTO,
} from "@infra/sdk";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { describeError } from "@/lib/errors";
import { timelineClient } from "@/lib/timeline-client";

/** The payload the composer hands to {@link UseTimeline.publish}. */
export interface PublishInput {
  text: string;
  files: File[];
}

export interface UseTimeline {
  /** Every loaded page flattened, newest first. */
  posts: TimelinePostDTO[] | null;
  loading: boolean;
  error: string | null;
  /** True when an older page exists (drives the infinite-scroll sentinel). */
  hasMore: boolean;
  /** True while an older page is being appended. */
  loadingMore: boolean;
  /** True when the last `loadMore` failed; the sentinel offers a manual retry. */
  loadMoreError: boolean;
  /** Fetch the next (older) page; no-op while one is in flight or at the end. */
  loadMore: () => void;
  /** True while a publish (image upload + create) is in flight. */
  publishing: boolean;
  /** Ids with a delete in flight (disables that card). */
  pendingIds: Set<string>;
  publish: (input: PublishInput) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const TIMELINE_KEY = ["timeline"] as const;

/** The infinite query's cache shape: one entry per fetched page. */
type TimelineData = InfiniteData<TimelinePage, string | null>;

function isAllowedType(value: string): value is TimelineImageContentType {
  return (TIMELINE_IMAGE_CONTENT_TYPES as readonly string[]).includes(value);
}

/**
 * Owns the current user's timeline feed plus its publish/delete mutations, backed
 * by TanStack Query (mirrors {@link useTodos}). The feed is an infinite query
 * (`["timeline"]`): each page comes from the cursor the previous page returned,
 * and mutations write the server's returned DTO straight into the cached pages.
 * Publish is two steps — upload each image, then create the post referencing the
 * returned urls — matching the API's two-step contract.
 */
export function useTimeline(enabled: boolean): UseTimeline {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const query = useInfiniteQuery({
    queryKey: TIMELINE_KEY,
    queryFn: ({ pageParam }) =>
      timelineClient.list(pageParam === null ? undefined : { cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled,
  });
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;

  const loadMore = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    fetchNextPage().then(noop, noop);
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

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
      // Feed is newest-first; the new post leads the first page. Cursors are
      // positional (strictly-older-than), so older pages are unaffected.
      queryClient.setQueryData<TimelineData>(TIMELINE_KEY, (prev) => {
        const [first, ...rest] = prev?.pages ?? [];
        if (!prev || !first) return prev;
        return { ...prev, pages: [{ ...first, posts: [created, ...first.posts] }, ...rest] };
      });
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
      queryClient.setQueryData<TimelineData>(TIMELINE_KEY, (prev) =>
        prev
          ? {
              ...prev,
              pages: prev.pages.map((page) => ({
                ...page,
                posts: page.posts.filter((p) => p.id !== id),
              })),
            }
          : prev,
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
    posts: query.data ? query.data.pages.flatMap((page) => page.posts) : null,
    loading: query.isLoading,
    // Initial-load and action (publish/delete) failures surface in the page-level
    // banner. A failed page *append* (`isFetchNextPageError`) is surfaced in-context
    // by the sentinel instead (visible + click-to-retry), so it's no longer silently
    // swallowed — matching iOS `TimelineViewModel.loadMore`, which sets `error` on catch.
    error: actionError ?? (query.isError ? "无法加载动态，请稍后重试。" : null),
    hasMore: hasNextPage,
    loadingMore: isFetchingNextPage,
    loadMoreError: query.isFetchNextPageError,
    loadMore,
    publishing: publishMutation.isPending,
    pendingIds,
    publish,
    remove,
  };
}

function noop(): void {}
