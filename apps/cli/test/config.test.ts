import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  configDir,
  credentialsPath,
  DEFAULT_API_URL,
  deviceIdPath,
  resolveApiUrl,
} from "../src/config.js";

describe("resolveApiUrl", () => {
  it("defaults when unset or blank", () => {
    expect(resolveApiUrl({})).toBe(DEFAULT_API_URL);
    expect(resolveApiUrl({ INFRA_LAB_API_URL: "   " })).toBe(DEFAULT_API_URL);
  });

  it("honors INFRA_LAB_API_URL and strips trailing slashes", () => {
    expect(resolveApiUrl({ INFRA_LAB_API_URL: "https://api.example.com/" })).toBe(
      "https://api.example.com",
    );
  });
});

describe("config paths", () => {
  it("uses XDG_CONFIG_HOME when set", () => {
    const env = { XDG_CONFIG_HOME: "/tmp/xdg" };
    expect(configDir(env)).toBe("/tmp/xdg/infra-lab");
    expect(credentialsPath(env)).toBe(join("/tmp/xdg/infra-lab", "credentials.json"));
    expect(deviceIdPath(env)).toBe(join("/tmp/xdg/infra-lab", "device.json"));
  });
});
