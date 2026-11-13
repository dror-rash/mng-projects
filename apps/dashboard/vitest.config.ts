import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      // Tests run on the server side of the line: resolve the marker like a Server Component does.
      "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    include: ["features/**/*.test.{ts,tsx}", "i18n/**/*.test.ts"],
    // Database tests run with `test:db` (vitest.db.config.ts).
    exclude: ["features/**/*.db.test.ts"],
    // Logic tests run in Node; component tests opt into jsdom with `// @vitest-environment jsdom`.
    setupFiles: ["./vitest.setup.ts"],
  },
});
