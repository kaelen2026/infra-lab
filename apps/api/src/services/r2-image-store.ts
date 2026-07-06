// Cloudflare R2 {@link ImageStore}: durable object storage for timeline/avatar
// uploads on the Workers runtime, where the local-disk `createLocalImageStore` has no
// filesystem. Same port, same `<uuid>.<ext>` naming and SAFE_NAME guard, so the
// routes are unchanged — only the persistence backend differs.
//
// Kept separate from `image-store.ts` (which imports node:fs) so the Workers bundle
// never pulls a Node filesystem module.

import { randomUUID } from "node:crypto";
// Type-only: avoids adding @cloudflare/workers-types to the global `types` (which would
// clash with node globals). The binding is provided by wrangler at runtime.
import type { R2Bucket } from "@cloudflare/workers-types";
import { TIMELINE_IMAGE_EXTENSIONS, type TimelineImageContentType } from "@infra/shared";
import type { ImageStore } from "../routes/timeline.routes.js";

// Reverse of TIMELINE_IMAGE_EXTENSIONS: infer the content type when serving a file
// back, since the extension is all we persist in the object name.
const CONTENT_TYPE_BY_EXTENSION: Record<string, TimelineImageContentType> = Object.fromEntries(
  Object.entries(TIMELINE_IMAGE_EXTENSIONS).map(([ct, ext]) => [
    ext,
    ct as TimelineImageContentType,
  ]),
);

// A stored name is `<uuid>.<ext>` — no path separators, so it can never traverse the
// bucket namespace (defence in depth on top of the route's url validation).
const SAFE_NAME = /^[A-Za-z0-9_-]+\.[a-z0-9]+$/;

/**
 * R2-backed {@link ImageStore}. `save` writes `<uuid>.<ext>` with its content type;
 * `read`/`has` fetch it back. Swap for {@link createLocalImageStore} on Node with no
 * change to the timeline routes (they depend only on the port).
 */
export function createR2ImageStore(opts: {
  bucket: R2Bucket;
  publicBasePath?: string;
}): ImageStore {
  const { bucket } = opts;
  const base = opts.publicBasePath ?? "/uploads";

  return {
    async save({ bytes, contentType }) {
      const name = `${randomUUID()}.${TIMELINE_IMAGE_EXTENSIONS[contentType]}`;
      await bucket.put(name, bytes, { httpMetadata: { contentType } });
      return { name, url: `${base}/${name}` };
    },

    async read(name) {
      if (!SAFE_NAME.test(name)) return null;
      const object = await bucket.get(name);
      if (!object) return null;
      const bytes = new Uint8Array(await object.arrayBuffer());
      const ext = name.slice(name.lastIndexOf(".") + 1);
      const contentType =
        object.httpMetadata?.contentType ??
        CONTENT_TYPE_BY_EXTENSION[ext] ??
        "application/octet-stream";
      return { bytes, contentType };
    },

    async has(name) {
      if (!SAFE_NAME.test(name)) return false;
      return (await bucket.head(name)) !== null;
    },
  };
}
