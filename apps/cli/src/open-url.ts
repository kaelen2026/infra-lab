import { spawn } from "node:child_process";
import { platform } from "node:os";

/**
 * Best-effort "open this URL in the default browser". Never throws — a headless or
 * sandboxed shell simply won't open anything, and the caller has already printed the
 * URL for manual use. Detached + unref'd so it never blocks the CLI's poll loop.
 */
export async function openBrowser(url: string): Promise<void> {
  const os = platform();
  const cmd = os === "darwin" ? "open" : os === "win32" ? "cmd" : "xdg-open";
  const args = os === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {}); // swallow ENOENT on minimal environments
    child.unref();
  } catch {
    // ignore — the URL was already printed for manual use
  }
}
