import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Dependency-free HS256 JWT for the native access token + opaque refresh tokens. */

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

interface AccessPayload {
  sub: string; // userId
  iat: number;
  exp: number;
}

export function signAccessToken(
  userId: string,
  secret: string,
  ttlSeconds: number,
  nowMs = Date.now(),
): string {
  const iat = Math.floor(nowMs / 1000);
  const payload: AccessPayload = { sub: userId, iat, exp: iat + ttlSeconds };
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyAccessToken(
  token: string,
  secret: string,
  nowMs = Date.now(),
): { userId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts as [string, string, string];
  const expected = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as AccessPayload;
    if (typeof payload.exp !== "number" || payload.exp * 1000 <= nowMs) return null;
    if (typeof payload.sub !== "string") return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}

/** Opaque refresh token + its storage hash. Only the hash ever touches the database. */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
