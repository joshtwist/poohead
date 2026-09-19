import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure rules engine (src/shared) + server reducers (src/server).
    include: ["src/**/*.test.ts"],
    // .claude/worktrees may hold throwaway copies of the repo; without this
    // vitest discovers and runs their stale duplicates of every suite.
    exclude: ["**/node_modules/**", "**/dist/**", ".claude/**", "e2e/**"],
  },
});
