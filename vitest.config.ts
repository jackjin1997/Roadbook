import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    projects: [
      {
        test: {
          name: "ariadne",
          environment: "node",
          include: ["src/ariadne/**/__tests__/**/*.test.ts"],
          globals: true,
          coverage: {
            provider: "v8",
            include: ["src/ariadne/**/*.ts"],
            exclude: [
              "src/ariadne/__tests__/**",
              "src/ariadne/cli.ts",
              "src/ariadne/server.ts",
              "src/ariadne/content-extractor.ts",
            ],
            reporter: ["text", "lcov", "html"],
            thresholds: {
              lines: 95,
              functions: 90,
              branches: 85,
            },
          },
        },
      },
      {
        test: {
          name: "frontend",
          environment: "jsdom",
          include: ["src/pages/**/__tests__/**/*.test.ts", "src/components/**/__tests__/**/*.test.ts"],
          globals: true,
        },
      },
    ],
  },
});
