import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./browser-tests",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3300",
    channel: "msedge",
    headless: true,
    viewport: { width: 1400, height: 950 },
  },
  webServer: {
    command: "pnpm dev --host 127.0.0.1",
    url: "http://127.0.0.1:3300",
    reuseExistingServer: false,
  },
});
