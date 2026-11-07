import { defineConfig } from "vitest/config";

// Unit tests of the e2e harness only (support/); the acceptance specs run with Playwright.
export default defineConfig({ test: { include: ["support/**/*.test.ts"] } });
