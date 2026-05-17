// Playwright config for the end-to-end smoke test.
//
// The smoke test is the only thing that runs in CI today. It walks
// the full user journey: signup → resume upload → analysis → artifact →
// refresh persists → sign out → sign in → data restored. If it fails,
// the GitHub Actions workflow fails, and we block the merge to main.
//
// Local target: `npm run dev` on port 3000. CI spins this up
// automatically via `webServer`. No external dependency on Vercel.

import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // The smoke test is sequential — it walks through one journey end-
  // to-end. No parallelism inside a single test run.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Retry once on CI for flake protection (network, Supabase cold).
  // Local runs don't retry — fail fast surfaces real issues quicker.
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  // Long timeout because the full journey includes a real resume
  // analyzer call (~15-30s) and possibly a real cover letter agent
  // call. Smoke tests should be slow + thorough, not fast + shallow.
  timeout: 5 * 60 * 1000, // 5 min per test
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Reasonable navigation timeout — pages should load in <10s on
    // dev server. Anything slower is a real bug.
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Auto-start the Next dev server before tests run. In CI this
  // happens in the GitHub Actions runner. Locally too — `npm run
  // test:e2e` will start the dev server if one isn't running.
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
