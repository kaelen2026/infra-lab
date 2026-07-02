import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  type ApnsConfig,
  type ApnsRequest,
  createApnsClient,
  defaultSignApnsJwt,
} from "../src/services/apns-client.js";

// A real EC P-256 keypair so we can verify the ES256 signature end-to-end.
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const config: ApnsConfig = {
  keyId: "KEY123",
  teamId: "TEAM456",
  bundleId: "ai.deeplang.infra.ios",
  privateKey: privatePem,
  production: false,
};

const b64urlJson = (s: string): unknown => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

describe("defaultSignApnsJwt", () => {
  it("produces a verifiable ES256 JWT with the APNS header + claims", () => {
    const jwt = defaultSignApnsJwt(config, 1_700_000_000);
    const [header, payload, signature] = jwt.split(".") as [string, string, string];

    expect(b64urlJson(header)).toEqual({ alg: "ES256", kid: "KEY123", typ: "JWT" });
    expect(b64urlJson(payload)).toEqual({ iss: "TEAM456", iat: 1_700_000_000 });

    // The signature must verify against the public key as raw R||S (ieee-p1363).
    const verifier = createVerify("SHA256");
    verifier.update(`${header}.${payload}`);
    verifier.end();
    const ok = verifier.verify(
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature, "base64url"),
    );
    expect(ok).toBe(true);
  });
});

// Records every request and returns queued responses; lets tests assert on the wire.
function fakeSender(responses: Array<{ status: number; body: string }>) {
  const sent: ApnsRequest[] = [];
  let i = 0;
  return {
    sent,
    send: async (req: ApnsRequest) => {
      sent.push(req);
      return responses[Math.min(i++, responses.length - 1)] ?? { status: 200, body: "" };
    },
  };
}

describe("createApnsClient.send", () => {
  it("targets the sandbox host + /3/device path with the alert topic and bearer token", async () => {
    const sender = fakeSender([{ status: 200, body: "" }]);
    const client = createApnsClient(config, {
      sender: sender.send,
      signJwt: () => "signed.jwt.value",
    });

    const res = await client.send("abc123", { title: "Hi", body: "There" });

    expect(res).toEqual({ ok: true });
    const req = sender.sent[0];
    expect(req?.host).toBe("api.sandbox.push.apple.com");
    expect(req?.path).toBe("/3/device/abc123");
    expect(req?.headers.authorization).toBe("bearer signed.jwt.value");
    expect(req?.headers["apns-topic"]).toBe("ai.deeplang.infra.ios");
    expect(req?.headers["apns-push-type"]).toBe("alert");
    expect(JSON.parse(req?.body ?? "{}")).toEqual({
      aps: { alert: { title: "Hi", body: "There" }, sound: "default" },
    });
  });

  it("uses the production host when configured", async () => {
    const sender = fakeSender([{ status: 200, body: "" }]);
    const client = createApnsClient(
      { ...config, production: true },
      { sender: sender.send, signJwt: () => "j" },
    );
    await client.send("t", { title: "a", body: "b" });
    expect(sender.sent[0]?.host).toBe("api.push.apple.com");
  });

  it("flags a 410 response as unregistered", async () => {
    const sender = fakeSender([{ status: 410, body: JSON.stringify({ reason: "Unregistered" }) }]);
    const client = createApnsClient(config, { sender: sender.send, signJwt: () => "j" });
    const res = await client.send("dead", { title: "a", body: "b" });
    expect(res).toEqual({ ok: false, status: 410, reason: "Unregistered", unregistered: true });
  });

  it("flags a 400 BadDeviceToken as unregistered", async () => {
    const sender = fakeSender([
      { status: 400, body: JSON.stringify({ reason: "BadDeviceToken" }) },
    ]);
    const client = createApnsClient(config, { sender: sender.send, signJwt: () => "j" });
    const res = await client.send("bad", { title: "a", body: "b" });
    expect(res).toMatchObject({ ok: false, unregistered: true });
  });

  it("does not treat a transient 429 as unregistered", async () => {
    const sender = fakeSender([
      { status: 429, body: JSON.stringify({ reason: "TooManyRequests" }) },
    ]);
    const client = createApnsClient(config, { sender: sender.send, signJwt: () => "j" });
    const res = await client.send("t", { title: "a", body: "b" });
    expect(res).toEqual({ ok: false, status: 429, reason: "TooManyRequests", unregistered: false });
  });

  it("caches the provider token across sends within the TTL", async () => {
    const sender = fakeSender([{ status: 200, body: "" }]);
    let signs = 0;
    const client = createApnsClient(config, {
      sender: sender.send,
      signJwt: () => {
        signs += 1;
        return "j";
      },
      now: () => 1_000, // frozen clock — never crosses the refresh window
    });
    await client.send("a", { title: "1", body: "1" });
    await client.send("b", { title: "2", body: "2" });
    expect(signs).toBe(1);
  });
});
