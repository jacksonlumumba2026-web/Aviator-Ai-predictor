import { defineConfig } from "vitest/config";
import path from "node:path";

// Integration tests against a Supabase-equivalent stack (scripts/local-supabase.sh).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: { include: ["tests/integration/**/*.int.test.ts"], testTimeout: 120_000, fileParallelism: false },
});
