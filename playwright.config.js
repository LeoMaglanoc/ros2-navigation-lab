import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.js",
  fullyParallel: true,
  timeout: 45000,
  retries: 0,
  workers: 2,
  use: {
    baseURL: process.env.BASE_URL || "http://127.0.0.1:4173",
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "laptop-chrome", use: { viewport: { width: 1365, height: 900 } } },
    {
      name: "phone-portrait-chrome",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
    {
      name: "phone-landscape-chrome",
      use: {
        viewport: { width: 844, height: 390 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command:
          "python3 -m http.server 4173 --bind 127.0.0.1 --directory dist",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env.CI,
      },
});
