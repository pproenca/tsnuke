# no-default-export

Default exports hide the binding's name from importers (`import Whatever from "./mod"` lets the caller pick any name), break grep-ability, and make refactors fragile. Named exports preserve the contract and let tooling do its job.

## Validation prompt

**Suppress aggressively** — this rule has the most framework-conventional false positives in the catalog.

- **Next.js convention files.** ALWAYS default-export. Skip when the file is:
  - `page.tsx`, `page.jsx` (App Router pages)
  - `layout.tsx`, `layout.jsx`
  - `loading.tsx`, `error.tsx`, `not-found.tsx`
  - `route.ts` (App Router route handlers when shaped as `export default`)
  - `middleware.ts` (also accepts named, but default is canonical)
  - `instrumentation.ts`
  - Files under `pages/` in Pages Router (default-exports a page component)
- **Remix routes** — default-exports the component.
- **Astro components** (`.astro` files) — different story but if a `.ts` file is wired as a default-exported Astro endpoint, suppress.
- **CLI / executable entry files** — Node CLIs sometimes default-export a function the bin wrapper imports; check `package.json#bin`.
- **React.lazy callers** — `React.lazy(() => import("./mod"))` only consumes default exports. If the file is loaded via `React.lazy`, default-export is required.
- **Storybook stories** — `*.stories.tsx` default-exports the meta object.
- **Test files** — usually irrelevant; if a `*.test.ts` default-exports something, it's likely wrong, but tsnuke may also be misfiring on a Vitest/Jest convention.

**Apply the fix** for plain library / utility / hook files. Components used by hand-written `import` (not React.lazy) should also be named-exported.

## Fix prompt

Convert default-export to named-export. Touch the export site and EVERY import site in lockstep — TS will catch import errors at the next typecheck.

### At the export site

```ts
// Before
export default function MyHook(arg: string) { /* … */ }

// After
export function MyHook(arg: string) { /* … */ }
```

For a default-exported class, object, or already-named function:

```ts
// Before
export default class UserService { /* … */ }
// After
export class UserService { /* … */ }
```

For a default-exported `const`/expression:

```ts
// Before
const utils = { /* … */ };
export default utils;
// After
export const utils = { /* … */ };
```

### At every import site

```ts
// Before
import MyHook from "./my-hook";
// After
import { MyHook } from "./my-hook";
```

Use the project's codemod tool (`ts-morph`, `@babel/parser`, or just `rg + sed`) to find every importer:

```sh
rg "from .[\"']\./?(.*/)?my-hook[\"']" --type ts --type tsx
```

Update each in the same commit.

### Bulk strategy

Process ONE file at a time. After each conversion, run `tsc --noEmit` — TS will surface missed imports with "has no default export" errors that point straight at the broken site.

## Common mistakes

- **Don't add a named export ALONGSIDE the default** (`export default X; export { X };`) and call it done. That leaves both surfaces alive and importers can still use the default form. Replace, don't double-up.
- **Don't convert a Next.js `page.tsx`** even if you "know better" — Next imports pages by file path, and only the default export is recognized as the page.
- **Don't forget to update `React.lazy`** if you accidentally convert a lazy-loaded module. Lazy needs `() => import("./mod").then(m => ({ default: m.Named }))` after the conversion.
