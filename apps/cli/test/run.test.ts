import { describe, expect, it } from "vitest";
import { run } from "../src/index.js";
import type { CliIO } from "../src/io.js";

function fakeIO(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: { print: (m) => out.push(m), error: (m) => err.push(m), prompt: async () => "" },
  };
}

// A fetch that must never be reached: these dispatch paths return before any call.
const noFetch = (() => {
  throw new Error("network should not be touched");
}) as unknown as typeof fetch;

describe("run (argv dispatch)", () => {
  it("--version prints the version and exits 0", async () => {
    const { io, out } = fakeIO();
    expect(await run(["--version"], {}, io, noFetch)).toBe(0);
    expect(out.join("")).toMatch(/\d+\.\d+\.\d+/);
  });

  it("--help exits 0; no args is a usage error (1)", async () => {
    const help = fakeIO();
    expect(await run(["--help"], {}, help.io, noFetch)).toBe(0);
    expect(help.out.join("\n")).toContain("infra-lab auth login");

    const none = fakeIO();
    expect(await run([], {}, none.io, noFetch)).toBe(1);
  });

  it("unknown group exits 2 with an error", async () => {
    const { io, err } = fakeIO();
    expect(await run(["bogus"], {}, io, noFetch)).toBe(2);
    expect(err.join("\n")).toContain("未知命令");
  });

  it("todo add without a title is a usage error (2)", async () => {
    const { io, err } = fakeIO();
    expect(await run(["todo", "add"], {}, io, noFetch)).toBe(2);
    expect(err.join("\n")).toContain("用法");
  });
});
