import { describe, expect, it } from "vitest";
import {
  LEGAL_DOC_KINDS,
  LEGAL_ROUTES,
  type LegalDocKind,
  legalPath,
  legalUrl,
} from "../src/contracts/legal";

describe("legal routes", () => {
  it("has exactly the privacy + terms kinds", () => {
    expect(LEGAL_DOC_KINDS).toEqual(["privacy", "terms"]);
  });

  it("maps every kind to a namespaced path", () => {
    for (const kind of LEGAL_DOC_KINDS) {
      expect(legalPath(kind)).toBe(LEGAL_ROUTES[kind]);
      expect(legalPath(kind)).toMatch(/^\/legal\//);
    }
  });
});

describe("legalUrl", () => {
  it("joins a base origin with the document path", () => {
    expect(legalUrl("https://app.example.com", "privacy")).toBe(
      "https://app.example.com/legal/privacy",
    );
    expect(legalUrl("https://app.example.com", "terms")).toBe(
      "https://app.example.com/legal/terms",
    );
  });

  it("trims trailing slashes on the base so it never doubles up", () => {
    expect(legalUrl("https://app.example.com/", "privacy")).toBe(
      "https://app.example.com/legal/privacy",
    );
    expect(legalUrl("https://app.example.com///", "terms")).toBe(
      "https://app.example.com/legal/terms",
    );
  });

  it("builds the same url every client references (no per-client drift)", () => {
    const base = "https://app.example.com";
    const kinds: LegalDocKind[] = ["privacy", "terms"];
    for (const kind of kinds) {
      expect(legalUrl(base, kind)).toBe(`${base}${legalPath(kind)}`);
    }
  });
});
