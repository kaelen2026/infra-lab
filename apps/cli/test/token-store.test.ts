import { randomUUID } from "node:crypto";
import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AuthTokens } from "@infra/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { createFileTokenStore } from "../src/token-store.js";

const TOKENS: AuthTokens = {
  accessToken: "access-abc",
  accessTokenExpiresIn: 900,
  refreshToken: "refresh-xyz",
  refreshTokenExpiresIn: 2_592_000,
  tokenType: "Bearer",
};

describe("createFileTokenStore", () => {
  let path: string;

  beforeEach(async () => {
    const dir = await mkdtemp(join(tmpdir(), "infra-cli-"));
    path = join(dir, "nested", "credentials.json");
  });

  it("returns null before anything is saved", async () => {
    const store = createFileTokenStore(path);
    expect(await store.load()).toBeNull();
  });

  it("round-trips tokens and writes a 0600 file", async () => {
    const store = createFileTokenStore(path);
    await store.save(TOKENS);
    expect(await store.load()).toEqual(TOKENS);
    const mode = (await stat(path)).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("clears the credentials so load() is null again", async () => {
    const store = createFileTokenStore(path);
    await store.save(TOKENS);
    await store.clear();
    expect(await store.load()).toBeNull();
  });

  it("treats a malformed file as logged out instead of throwing", async () => {
    const store = createFileTokenStore(path);
    await store.save(TOKENS);
    await writeFile(path, "not json{");
    expect(await store.load()).toBeNull();
  });

  it("clear() is a no-op when the file is absent", async () => {
    const store = createFileTokenStore(join(tmpdir(), `absent-${randomUUID()}.json`));
    await expect(store.clear()).resolves.toBeUndefined();
  });
});
