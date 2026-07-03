/**
 * Route-level loading fallback, shown while a segment's server work resolves. A
 * quiet centered pulse — deliberately minimal so it reads as "loading", not content.
 */
export default function Loading() {
  return (
    <main className="grid min-h-dvh place-items-center p-6" aria-busy>
      <span
        role="status"
        aria-label="加载中"
        className="size-2 animate-pulse rounded-full bg-primary"
      />
    </main>
  );
}
