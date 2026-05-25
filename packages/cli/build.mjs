/**
 * Build the runnable `ts-doctor` binary.
 *
 * The package sources export `src/main/*.ts` directly (scaffold convenience: typecheck +
 * vitest resolve from source with no prior build). That is NOT runnable as a real process:
 * the relative imports carry `.js` extensions that resolve to on-disk `.ts` files, and
 * Node's native type-stripping does not rewrite `.js`→`.ts`, so `node src/main/bin.ts`
 * fails with ERR_MODULE_NOT_FOUND. We therefore BUNDLE the CLI (entry + every `@ts-doctor/*`
 * workspace slice + effect/@effect, resolved from source) into one self-contained ESM file.
 *
 * `typescript` stays EXTERNAL — it is the engine's analysis backend (~9 MB), declared as a
 * dependency and resolved from node_modules at runtime (matches the original design).
 */
import { build } from "esbuild";
import { chmodSync } from "node:fs";

await build({
  entryPoints: ["src/main/bin.ts"],
  outfile: "dist/cli.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // `typescript` is the analysis backend — keep it external (a runtime dependency).
  external: ["typescript"],
  // ESM output needs a CJS-interop shim for any transitively-bundled CommonJS module that
  // reaches for `require`/`__dirname`. (The executable shebang is preserved from the entry
  // file `bin.ts` by esbuild and stays on line 1 — do NOT re-add it here or Node sees two.)
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

chmodSync("dist/cli.js", 0o755);
console.log("✓ built dist/cli.js");
