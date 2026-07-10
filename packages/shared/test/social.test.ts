import { describe, expect, it } from "vitest";
import {
  SOCIAL_PROVIDERS,
  socialStartPath,
  socialStartQuerySchema,
  socialStartUrl,
  socialTokenPath,
} from "../src/contracts/social";

describe("social route paths", () => {
  it("builds the per-provider start / token paths", () => {
    expect(socialStartPath("google")).toBe("/auth/social/google/start");
    expect(socialTokenPath("google")).toBe("/auth/social/google/token");
  });

  it("exposes google as the only provider (for now)", () => {
    expect([...SOCIAL_PROVIDERS]).toEqual(["google"]);
  });
});

describe("socialStartUrl", () => {
  it("joins the API base + start path + default redirect (root, encoded)", () => {
    expect(socialStartUrl("https://api.example", "google")).toBe(
      "https://api.example/auth/social/google/start?redirect=%2F",
    );
  });

  it("encodes a custom same-origin redirect path", () => {
    expect(socialStartUrl("http://localhost:3001", "google", "/account")).toBe(
      "http://localhost:3001/auth/social/google/start?redirect=%2Faccount",
    );
  });

  it("produces a redirect the server-side schema accepts", () => {
    // The `redirect` we emit must survive the route's own validation.
    expect(socialStartQuerySchema.safeParse({ redirect: "/" }).success).toBe(true);
    expect(socialStartQuerySchema.safeParse({ redirect: "/account" }).success).toBe(true);
    // Guardrails the schema must still reject (open-redirect shapes).
    expect(socialStartQuerySchema.safeParse({ redirect: "//evil.example" }).success).toBe(false);
    expect(socialStartQuerySchema.safeParse({ redirect: "https://evil.example" }).success).toBe(
      false,
    );
  });
});
