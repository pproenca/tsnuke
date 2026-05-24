import { defineConfig } from "tsup";

/**
 * The CLI ships as a self-contained binary: bundle the workspace packages
 * (`@ts-doctor/core`, `@ts-doctor/rules`) into `dist/cli.js` so there is no
 * runtime resolution of unpublished `workspace:*` deps. `typescript` stays
 * external — it is a real dependency resolved from `node_modules` at runtime.
 */
export default defineConfig({
  entry: ["src/cli.ts", "src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  dts: true,
  clean: true,
  shims: false,
  noExternal: [/^@ts-doctor\//],
  external: ["typescript"],
});
