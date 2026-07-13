import { describe, expect, it } from "vitest";

import { findMissing, parseSourceSets, stripComments } from "../check-contract-drift.mjs";

describe("findMissing", () => {
  it("flags every source item absent from the mirror", () => {
    const source = new Set(["A", "B", "C"]);
    const mirror = new Set(["A"]);
    expect(findMissing(source, mirror)).toEqual(["B", "C"]);
  });

  it("passes when the mirror is a superset (extra sentinels allowed)", () => {
    const source = new Set(["A", "B"]);
    const mirror = new Set(["A", "B", "UNKNOWN"]);
    expect(findMissing(source, mirror)).toEqual([]);
  });

  it("passes on an exact match", () => {
    const source = new Set(["A", "B"]);
    const mirror = new Set(["A", "B"]);
    expect(findMissing(source, mirror)).toEqual([]);
  });
});

describe("stripComments", () => {
  it("blanks a commented-out case so its quoted literal is not harvested", () => {
    const block =
      '  case invalidCode = "INVALID_CODE"\n  // case lastCredential = "LAST_CREDENTIAL"';
    const literals = [...stripComments(block).matchAll(/"([A-Z][A-Z0-9_]*)"/g)].map((m) => m[1]);
    expect(literals).toEqual(["INVALID_CODE"]);
  });

  it("removes block comments while preserving line count", () => {
    const text = 'a\n/* "WEB"\n"IOS" */\nb';
    const stripped = stripComments(text);
    expect(stripped.match(/"[A-Z]+"/g)).toBeNull();
    expect(stripped.split("\n").length).toBe(text.split("\n").length);
  });
});

describe("parseSourceSets", () => {
  it("extracts the 18 canonical auth error codes from the contract source", () => {
    const { errorCodes } = parseSourceSets();
    expect(errorCodes.size).toBe(18);
    expect(errorCodes.has("INVALID_REQUEST")).toBe(true);
    expect(errorCodes.has("LAST_CREDENTIAL")).toBe(true);
  });

  it("extracts the 7 canonical platforms from the contract source", () => {
    const { platforms } = parseSourceSets();
    expect(platforms.size).toBe(7);
    expect([...platforms]).toEqual(["web", "ios", "android", "harmony", "cli", "weapp", "macos"]);
  });
});
