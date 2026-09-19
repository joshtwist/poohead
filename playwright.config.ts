import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for end-to-end testing of 💩head.
 *
 * We spin up BOTH servers:
 * - wrangler dev on :8787 (Workers + Durable Object + WebSocket)
 * - vite dev on :5173 (React app, proxies /api to wrangler)
 *
 * Tests run against Vite (port 5173) which proxies API/WS calls to wrangler.
 * This mirrors the local dev setup exactly. The Worker must run with
 * `TEST_HOOKS=1` (see .dev.vars) so specs can force deterministic hands.
 *
 * Projects: the flow specs run on `iphone` + `desktop`; the layout and
 * screenshot specs run on every viewport, including both iPad orientations.
 */
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD_UA =
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

/** Only the layout + screenshot specs are viewport-sensitive. */
const LAYOUT_ONLY = /(layout|screenshot)\.spec\.ts$/;

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false, // Games share DO state; keep serial for determinism
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    // A click on a disabled/hidden control should fail with a reason, not
    // hang until the test timeout.
    actionTimeout: 10_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      // Chromium with an iPhone 14 Pro viewport + touch + mobile UA. We
      // don't use the webkit device preset so we can skip installing a
      // second browser engine -- the layout checks are viewport-based.
      name: "iphone",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: IPHONE_UA,
      },
    },
    {
      name: "iphone-se",
      testMatch: LAYOUT_ONLY,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 667 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: IPHONE_UA,
      },
    },
    {
      name: "ipad",
      testMatch: LAYOUT_ONLY,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 820, height: 1180 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: IPAD_UA,
      },
    },
    {
      // iPad landscape as Safari leaves it: ~730px of usable height.
      name: "ipad-landscape",
      testMatch: LAYOUT_ONLY,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1180, height: 730 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: IPAD_UA,
      },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "pnpm dev:worker",
      url: "http://localhost:8787",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "pnpm dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
