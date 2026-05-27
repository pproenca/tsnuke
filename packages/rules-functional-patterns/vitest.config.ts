import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/test/**/*.test.ts"],
    server: {
      deps: {
        inline: ["@tsnuke/rules-core-effect", "@tsnuke/contracts-effect"],
      },
    },
  },
});
