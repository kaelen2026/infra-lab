import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("release workflow contract", () => {
  it("keeps release tag triggers, release gates, and operator docs aligned", async () => {
    const { stdout } = await execFileAsync("node", [
      ".github/scripts/check-release-workflow-contract.mjs",
    ]);

    expect(stdout).toContain("Release workflow contract verified");
  });
});
