import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "~": "/src" } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    restoreMocks: true,
  },
});
