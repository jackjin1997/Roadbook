import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "eval",
    environment: "node",
    include: ["src/ariadne/__tests__/eval/**/*.eval.ts"],
    globals: true,
    testTimeout: 90_000,
    hookTimeout: 15_000,
    // Eval tests are sequential to avoid rate limits
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
