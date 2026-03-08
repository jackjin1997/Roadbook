import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/ariadne/**/__tests__/**/*.test.ts"],
    globals: true,
    coverage: {
      provider: "v8",
      include: ["src/ariadne/**/*.ts"],
      exclude: [
        "src/ariadne/__tests__/**",
        "src/ariadne/cli.ts",
        "src/ariadne/server.ts", // covered by server.test.ts integration tests
      ],
      reporter: ["text", "lcov", "html"],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
      },
    },
  },
});
