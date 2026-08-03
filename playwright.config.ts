import { defineConfig, devices } from "@playwright/test";

const webPort = process.env.EPITON_E2E_WEB_PORT ?? "5173";
const webBaseUrl = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: webBaseUrl,
    trace: "on-first-retry",
  },
  webServer: {
    command: `pnpm --filter @epiton/web dev --host 127.0.0.1 --port ${webPort}`,
    url: webBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
