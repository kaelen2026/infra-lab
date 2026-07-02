import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { TIMELINE_IMAGE_EXTENSIONS, type TimelineImageContentType } from "@infra/shared";
import type { ImageStore } from "../routes/timeline.routes.js";

// Reverse of TIMELINE_IMAGE_EXTENSIONS: infer the content type when serving a file
// back, since the extension is all we persist.
const CONTENT_TYPE_BY_EXTENSION: Record<string, TimelineImageContentType> = Object.fromEntries(
  Object.entries(TIMELINE_IMAGE_EXTENSIONS).map(([ct, ext]) => [
    ext,
    ct as TimelineImageContentType,
  ]),
);

// A stored name is `<uuid>.<ext>` — no path separators, so it can never escape the
// uploads dir (defence in depth on top of the route's url validation).
const SAFE_NAME = /^[A-Za-z0-9_-]+\.[a-z0-9]+$/;

/**
 * Local-directory {@link ImageStore}: writes each upload to `<dir>/<uuid>.<ext>`
 * and serves it back from `<publicBasePath>/<name>`. First-cut storage — swap for
 * object storage without touching the routes (they depend only on the port).
 */
export function createLocalImageStore(opts: { dir: string; publicBasePath?: string }): ImageStore {
  const dir = resolve(opts.dir);
  const base = opts.publicBasePath ?? "/uploads";

  const pathFor = (name: string): string | null => {
    if (!SAFE_NAME.test(name)) return null;
    return join(dir, name);
  };

  return {
    async save({ bytes, contentType }) {
      await mkdir(dir, { recursive: true });
      const name = `${randomUUID()}.${TIMELINE_IMAGE_EXTENSIONS[contentType]}`;
      await writeFile(join(dir, name), bytes);
      return { name, url: `${base}/${name}` };
    },

    async read(name) {
      const path = pathFor(name);
      if (!path) return null;
      const ext = name.slice(name.lastIndexOf(".") + 1);
      const contentType = CONTENT_TYPE_BY_EXTENSION[ext] ?? "application/octet-stream";
      try {
        const bytes = await readFile(path);
        return { bytes, contentType };
      } catch {
        return null;
      }
    },

    async has(name) {
      const path = pathFor(name);
      if (!path) return false;
      try {
        await access(path);
        return true;
      } catch {
        return false;
      }
    },
  };
}
