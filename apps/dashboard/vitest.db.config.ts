import path from "node:path";

import { defineConfig } from "vitest/config";

// Database tests (`*.db.test.ts`, task 076): the demo seed against the migrated database in DATABASE_URL
// (`pnpm --filter @repo/dashboard test:db`; the repo-root .env, or the lane's environment). The unfinished
// uploads' test (task 087) also needs the local storage server (STORAGE_BUCKET, STORAGE_LOCAL_URL).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    include: ["scripts/**/*.db.test.ts", "features/**/*.db.test.ts"],
    setupFiles: ["./vitest.db.setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
  },
});
