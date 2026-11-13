import { defineConfig } from "vitest/config";

// The shell's unit tests: its catalogue's parity (task 094) so far.
export default defineConfig({
  test: { include: ["features/**/*.test.{ts,tsx}", "i18n/**/*.test.ts"] },
});
