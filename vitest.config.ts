import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts", "scripts/**/__tests__/**/*.test.ts"],
    globalSetup: ["./src/test/global-setup.ts"],
    fileParallelism: false,
    env: {
      DATABASE_URL: "file:./test.db",
      AUTH_SECRET: "test-only-secret-not-used-anywhere-else",
      AUTH_MODE: "mock",
      FAKE_PAYMENTS_FAIL_RATE: "0",
    },
  },
});
