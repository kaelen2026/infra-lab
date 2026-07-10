import type { Db } from "@infra/db";
import { describe, expect, it } from "vitest";
import type { SessionContext, UserRecord } from "../src/routes/auth.routes.js";
import { createSessionService } from "../src/services/session-service.js";
import { signAccessToken } from "../src/services/tokens.js";

const SECRET = "session-test-secret";
const USER: UserRecord = {
  id: "user_1",
  phone: "+8613800138000",
  displayName: "Kai",
  avatarUrl: null,
  role: "user",
  createdAt: new Date("2026-07-10T00:00:00Z"),
};
const SESSION_CONTEXT: SessionContext = {
  ip: "127.0.0.1",
  headers: new Headers(),
  platform: "web",
};

function dbWithUser(user: UserRecord | null): Db {
  const query = {
    from: () => query,
    leftJoin: () => query,
    where: () => query,
    limit: async () => (user ? [{ user, profile: user }] : []),
  };
  return { select: () => query } as unknown as Db;
}

function sessions(user: UserRecord | null = USER) {
  return createSessionService({
    db: dbWithUser(user),
    secret: SECRET,
    cookie: { name: "infra.session", secure: false },
    ttl: { webSeconds: 60, accessSeconds: 60, refreshSeconds: 60 },
  });
}

describe("SessionService.requireUser", () => {
  it("resolves an application-issued web session cookie", async () => {
    const service = sessions();
    const issued = await service.issueWebSession(USER, SESSION_CONTEXT);
    const cookie = issued.cookies[0]?.split(";")[0];

    await expect(service.requireUser(new Headers({ cookie }))).resolves.toMatchObject({
      id: USER.id,
    });
  });

  it("resolves an application-issued Bearer token", async () => {
    const service = sessions();
    const accessToken = signAccessToken(USER.id, SECRET, 60);

    await expect(
      service.requireUser(new Headers({ authorization: `Bearer ${accessToken}` })),
    ).resolves.toMatchObject({ id: USER.id });
  });

  it("rejects credentials that were not issued by the application session service", async () => {
    const service = sessions();

    await expect(
      service.requireUser(new Headers({ authorization: "Bearer better-auth-session-token" })),
    ).resolves.toBeNull();
  });

  it("rejects a valid token when its user no longer exists", async () => {
    const accessToken = signAccessToken(USER.id, SECRET, 60);
    const deletedUserService = sessions(null);

    await expect(
      deletedUserService.requireUser(new Headers({ authorization: `Bearer ${accessToken}` })),
    ).resolves.toBeNull();
  });
});
