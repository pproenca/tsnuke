/**
 * Build the runnable `ts-doctor-mcp` stdio server.
 *
 * Like the CLI, this package exports `src/main/*.ts` directly (typecheck + vitest resolve
 * from source). That is NOT runnable as a real process: relative imports carry `.js`
 * extensions that resolve to on-disk `.ts` files, and Node's native type-stripping does
 * not rewrite `.js`→`.ts`. We BUNDLE the server (entry + every `@ts-doctor/*` slice +
 * effect/@effect + the MCP SDK, resolved from source) into one self-contained ESM file.
 *
 * `typescript` stays EXTERNAL — the engine's analysis backend (~9 MB), a runtime dependency
 * resolved from node_modules.
 */
import { build } from "esbuild";
import { chmodSync } from "node:fs";

await build({
  entryPoints: ["src/main/server.ts"],
  outfile: "dist/server.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["typescript"],
  // ESM output needs a CJS-interop shim for transitively-bundled CommonJS (the MCP SDK
  // pulls some in). The shebang is preserved from the entry file `server.ts` (line 1) —
  // do NOT re-add it here or Node sees two shebangs and fails to parse.
  banner: {
    js: [
      "import { createRequire as __td_createRequire } from 'node:module';",
      "import { fileURLToPath as __td_fileURLToPath } from 'node:url';",
      "import { dirname as __td_dirname } from 'node:path';",
      "const require = __td_createRequire(import.meta.url);",
      "const __filename = __td_fileURLToPath(import.meta.url);",
      "const __dirname = __td_dirname(__filename);",
    ].join("\n"),
  },
  logLevel: "info",
});

chmodSync("dist/server.js", 0o755);
console.log("✓ built dist/server.js");
