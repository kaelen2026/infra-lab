import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Load the repo .env so the spawned API server gets DATABASE_URL / REDIS_URL /
// OTP_DEBUG_RETURN_CODE. Tests read the OTP from the debug-coded request response.
for (const candidate of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")]) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}

const WEB_URL = "http://localhost:3000";
const API_HEALTH = "http://localhost:3001/health";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: WEB_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  // Start the API and web servers if they are not already up. Both inherit the env
  // loaded above; reuse running instances locally so reruns are fast.
  webServer: [
    {
      command: "pnpm --filter @infra/api dev",
      url: API_HEALTH,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @infra/web dev",
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
