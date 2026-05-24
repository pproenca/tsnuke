import { defineConfig } from "tsup";

/**
 * The MCP server ships as a self-contained stdio binary: bundle the workspace
 * packages (`@ts-doctor/core`, `@ts-doctor/rules`); keep `typescript`, the MCP
 * SDK, and `zod` external (real runtime deps resolved from `node_modules`).
 */
export default defineConfig({
  entry: ["src/server.ts", "src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  dts: true,
  clean: true,
  shims: false,
  noExternal: [/^@ts-doctor\//],
  external: ["typescript", "@modelcontextprotocol/sdk", "zod"],
});
