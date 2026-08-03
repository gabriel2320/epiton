import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    "next-host.spec.ts",
    "login.spec.ts",
    "workspace.spec.ts",
    "board.spec.ts",
    "wizard-report.spec.ts",
    "calendar.spec.ts",
  ],
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:3001",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm --filter @epiton/web exec next start --hostname 127.0.0.1 --port 3001",
    url: "http://127.0.0.1:3001",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
