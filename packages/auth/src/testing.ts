import type { OtpStore } from "./otp.js";

/**
 * In-memory {@link OtpStore} with real TTL semantics, driven by a shared
 * virtual clock so tests can assert TTLs and fast-forward time deterministically.
 */
export class FakeRedis implements OtpStore {
  private readonly data = new Map<string, { value: string; expireAt: number | null }>();
  readonly clock = { ms: 1_700_000_000_000 };

  now = () => this.clock.ms;

  /** Advance the virtual clock (seconds) — expired keys disappear lazily. */
  advance(seconds: number): void {
    this.clock.ms += seconds * 1000;
  }

  private live(key: string): { value: string; expireAt: number | null } | undefined {
    const entry = this.data.get(key);
    if (!entry) return undefined;
    if (entry.expireAt !== null && entry.expireAt <= this.clock.ms) {
      this.data.delete(key);
      return undefined;
    }
    return entry;
  }

  async set(
    key: string,
    value: string,
    opts: { ttlSeconds?: number; ifNotExists?: boolean } = {},
  ): Promise<boolean> {
    if (opts.ifNotExists && this.live(key)) return false;
    const expireAt = opts.ttlSeconds != null ? this.clock.ms + opts.ttlSeconds * 1000 : null;
    this.data.set(key, { value, expireAt });
    return true;
  }

  async get(key: string): Promise<string | null> {
    return this.live(key)?.value ?? null;
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const key of keys) {
      if (this.live(key)) {
        this.data.delete(key);
        n++;
      }
    }
    return n;
  }

  async incr(key: string): Promise<number> {
    const entry = this.live(key);
    const next = (entry ? Number(entry.value) : 0) + 1;
    this.data.set(key, { value: String(next), expireAt: entry?.expireAt ?? null });
    return next;
  }

  async decr(key: string): Promise<number> {
    const entry = this.live(key);
    const next = (entry ? Number(entry.value) : 0) - 1;
    this.data.set(key, { value: String(next), expireAt: entry?.expireAt ?? null });
    return next;
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const entry = this.live(key);
    if (!entry) return false;
    entry.expireAt = this.clock.ms + ttlSeconds * 1000;
    return true;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.live(key);
    if (!entry) return -2;
    if (entry.expireAt === null) return -1;
    return Math.ceil((entry.expireAt - this.clock.ms) / 1000);
  }

  async exists(key: string): Promise<boolean> {
    return this.live(key) !== undefined;
  }

  /** Test helper: list keys that are currently live. */
  liveKeys(): string[] {
    return [...this.data.keys()].filter((k) => this.live(k));
  }
}
