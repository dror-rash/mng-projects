import { defineConfig } from "vitest/config";

// Database tests (`*.db.test.ts`, task 089): against the migrated database in DATABASE_URL (`pnpm test:db`).
export default defineConfig({
  test: {
    include: ["src/**/*.db.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    // Better Auth through Vite, not Node's module cache: after `vi.resetModules()` a new import is a new copy
    // with its own in-memory state, like another server instance (another Cloud Run container).
    server: { deps: { inline: [/better-auth/] } },
  },
});
