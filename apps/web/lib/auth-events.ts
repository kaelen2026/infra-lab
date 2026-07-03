/**
 * A tiny module-level pub/sub for "the session is no longer valid" (a 401 from any
 * request). It decouples the two providers: the query layer (which sees the failing
 * requests) emits, and the session layer (which owns auth state) subscribes — even
 * though neither can reach the other through React context. Web sessions ride a
 * cookie with no client-side refresh, so a 401 mid-session means expired: reset and
 * bounce to login.
 */

type Handler = () => void;

const handlers = new Set<Handler>();

/** Subscribe to unauthorized events. Returns an unsubscribe fn. */
export function onUnauthorized(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

/** Notify all subscribers that a request came back 401. */
export function emitUnauthorized(): void {
  for (const handler of handlers) handler();
}
