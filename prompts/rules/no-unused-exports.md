# no-unused-exports

An exported binding nobody imports is dead public surface. It bloats the API, confuses readers ("is this used?"), and obscures the real entry points. tsnuke's GRAPH tier flags every export with zero consumers in the analyzed graph.

## Validation prompt

This is the **single highest-FP-rate rule** in the catalog. Suppress on ANY of these — the diagnostic doesn't mean "delete this".

- **Public package entry points.** If the file is listed in `package.json#main`, `#exports`, `#types`, or any `#files` glob, the exports are consumed *outside* this repo. tsnuke can't see those consumers. Check `package.json` before touching anything.
- **Framework convention exports.** Next.js (`page.tsx`, `layout.tsx`, `route.ts`, `middleware.ts`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `instrumentation.ts`), Remix (`loader`, `action`, `meta`, `links`), Astro components, Vite plugins — the framework imports these by file path / convention, not via grep-able imports. Skip in any of these files.
- **Dynamic imports.** `await import("./mod")` doesn't show up in tsnuke's static graph. If the codebase uses `import()` for code-splitting, route-based loading, or plugin systems, the imports are invisible. Grep for `import("` and `import \``  before deleting.
- **Test-only re-exports.** Barrel files that re-export internals for test fixtures (`export { internalThing } from "./foo"` used by a sibling `*.test.ts`) — the import edge exists but goes file → test, which tsnuke may not traverse. Check for `import {<name>} from` in test files.
- **`index.ts` barrels that exist to define the *public* surface.** Even if no in-repo file imports them, they're the boundary contract. Suppress in `index.ts` / `*.public.ts` / similar.
- **`*.d.ts` / ambient declarations** — the imports are at type-use sites, not value-use sites. tsnuke's graph tracks both, but check the diagnostic isn't on an ambient declaration.

**Apply the fix only when**: the file is internal (not a package entry), not a framework-convention file, AND a grep across the WHOLE repo (including test files, scripts, configs) for `<name>` returns zero hits besides the export itself.

## Fix prompt

Two steps, in order:

### Step 1 — confirm zero consumers (do not skip this)

```sh
rg "from .[\"']\.\.?/(.*/)?$file[\"']" --type ts --type tsx
rg "import\(.['\"]\.\.?/(.*/)?$file" --type ts --type tsx
rg "\\b$exportName\\b" --type ts --type tsx  # by name, in case it's re-exported
```

If ANY hit shows up outside the source file itself OR the file's own test file, **abort** — the diagnostic is a false positive. Add the rule + file shape to `.tsnuke/false-positives.md` so future runs skip it.

### Step 2 — pick a removal action

- **Sole export → delete the binding.** If the file's other contents are now unused too, delete the whole file. Update any barrel `index.ts` that re-exported it.
- **One of several exports → drop the `export` keyword.** Leave the binding in place; it becomes file-local. Don't delete a function that's still called inside the same file just because the export is unused.
- **Used internally + exported uselessly → drop the `export` keyword.** Same as above.

After removing, re-run `tsc --noEmit` to catch any consumer the grep missed (declaration files, type-only imports).

## Common mistakes

- **Don't bulk-delete from a worklist.** Process exports one at a time so you can revert individually when `tsc` catches a missed consumer.
- **Don't delete `export default function ComponentName` in a Next.js route file.** That's a framework convention; the route loader imports it implicitly.
- **Don't delete TypeScript type-only exports without checking `import type` consumers.** Type imports are easy to miss in grep if you only search for value imports.
