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
        "src/ariadne/content-extractor.ts", // extracted from server.ts, tested via server.test.ts
      ],
      reporter: ["text", "lcov", "html"],
      thresholds: {
        lines: 95,
        functions: 90,
        branches: 85,
      },
    },
  },
});
