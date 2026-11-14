import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

// Locally: dev servers. In CI: the workflow builds first, then we run `start`.
const mode = process.env.CI ? "start" : "dev";

const testDir = defineBddConfig({
  features: "../docs/features/*.feature",
  featuresRoot: "../docs/features",
  steps: "./steps/*.ts",
  // Specs written ahead of their task carry @wip; the tag comes off when the task starts (WORKFLOW.md).
  // @build scenarios need a production build: `next dev` answers a form posted without JavaScript with a 500
  // (task 114). They run in CI (`start`) and are skipped against dev servers. E2E_TAGS overrides both.
  tags: process.env.E2E_TAGS || (mode === "dev" ? "not @wip and not @build" : "not @wip"),
});

// Ports come from the environment so parallel lanes (scripts/lane.sh) don't clash; defaults are the usual ones.
const shellUrl = `http://localhost:${process.env.SHELL_PORT ?? 3000}`;
const exampleUrl = `http://localhost:${process.env.EXAMPLE_PORT ?? 3001}`;
const dashboardUrl = `http://localhost:${process.env.DASHBOARD_PORT ?? 3002}`;

// BASE_URL: a deployment (the preview run). Uploads and server actions go to Cloud Run and Cloud SQL, and the
// sign-up pacing (fixtures.ts) can wait about 11.5 s inside one scenario, so both timeouts are longer there.
const deployed = Boolean(process.env.BASE_URL);

export default defineConfig({
  testDir,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0, // flaky tests are bugs; fix them
  ...(deployed ? { timeout: 90_000 } : {}),
  // Dev servers compile each route on its first visit, which can take several seconds under parallel load.
  // CI runs production builds, so it keeps Playwright's default 5s, except against a deployment.
  expect: { timeout: process.env.CI && !deployed ? 5_000 : 15_000 },
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL: process.env.BASE_URL ?? shellUrl,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Set BASE_URL to run against a preview deploy and skip local servers.
  webServer: deployed
    ? undefined
    : [
        // The shell owns /api/auth. Every scenario signs up from one IP, which production rate limits would block.
        { command: `pnpm --filter @repo/shell ${mode}`, url: shellUrl, reuseExistingServer: !process.env.CI, timeout: 120_000, env: { AUTH_DISABLE_RATE_LIMIT: "true" } },
        { command: `pnpm --filter @repo/example-zone ${mode}`, url: `${exampleUrl}/example`, reuseExistingServer: !process.env.CI, timeout: 120_000 },
        { command: `pnpm --filter @repo/dashboard ${mode}`, url: `${dashboardUrl}/dashboard`, reuseExistingServer: !process.env.CI, timeout: 120_000 },
      ],
});
