import { COPY } from "@infra/design";
import { HttpAuthError, type TimelinePostDTO } from "@infra/sdk";
import { useEffect, useState } from "react";

import { timelineClient } from "@/lib/timeline-client";

export type SharedPostState =
  | { status: "loading" }
  | { status: "ready"; post: TimelinePostDTO }
  | { status: "error"; message: string };

/**
 * Fetch a single shared post through the public share endpoint. A missing/deleted
 * post (`TIMELINE_POST_NOT_FOUND`) is a distinct, friendlier message than a
 * generic network failure.
 */
export function useSharedPost(id: string | undefined): SharedPostState {
  const [state, setState] = useState<SharedPostState>({ status: "loading" });

  useEffect(() => {
    if (!id) {
      setState({ status: "error", message: COPY.timelineShare.notFound });
      return;
    }
    let active = true;
    setState({ status: "loading" });
    (async () => {
      try {
        const post = await timelineClient.getShared(id);
        if (active) setState({ status: "ready", post });
      } catch (err) {
        if (!active) return;
        // The share endpoint's only 404 is TIMELINE_POST_NOT_FOUND. Branch on the
        // status (HttpAuthError.code is typed to the auth codes, not timeline's).
        const notFound = err instanceof HttpAuthError && err.status === 404;
        setState({
          status: "error",
          message: notFound ? COPY.timelineShare.notFound : COPY.timelineShare.loadError,
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  return state;
}
