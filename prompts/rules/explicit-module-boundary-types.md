# explicit-module-boundary-types

Exported functions and methods should declare their return types explicitly. Inference works internally; at the module boundary, an annotated type is a documented contract that callers (and tools, and future readers) can trust without re-reading the body.

## Validation prompt

**Suppress when** any of these apply (the diagnostic is a false positive for this shape):

- **Express / Hono / Next.js route handlers.** Frameworks expect specific function shapes (`(req, res) => …`, `async (c) => c.json(...)`); annotating the return type doesn't help callers and often forces awkward `Response | Promise<Response>` unions. Skip when the export's callers are framework infrastructure, not application code.
- **React component functions.** `function MyComponent(): JSX.Element` or `(): ReactNode` is noise — React's type system already knows. Suppress if the file is `.tsx` and the function returns JSX.
- **`type Foo = …` aliases used as exported types.** This rule applies to function exports; if the lint fires on an `export type`/`export interface`, it's a tsnuke bug — surface it but skip the fix.
- **Test fixtures** in `*.test.ts` / `*.spec.ts` — the test framework calls them, not application code, and the annotation noise dominates the file.
- **Generated code** (auto-generated SDKs, OpenAPI clients) — annotations would be re-generated away.

**Apply the fix** when the export is a plain library function, utility, or API surface consumed by hand-written code.

## Fix prompt

Add a return type annotation that matches what TS infers. Two cases:

### Case A — the inferred type is a known simple shape

```ts
// Before
export function add(a: number, b: number) {
  return a + b;
}

// After
export function add(a: number, b: number): number {
  return a + b;
}
```

For `Promise`-returning async functions, the annotation is `Promise<T>`:

```ts
export async function fetchUser(id: string): Promise<User> {
  ...
}
```

### Case B — the inferred type is complex

Run `tsc --noEmit` and look at the hover type for the function name. Copy that type literally. If it's an inline object literal that looks ugly, extract it to a named `interface` or `type` BEFORE annotating — but only if there's no existing nearby type to reuse.

### Case C — the function might throw

`Promise<T>` annotates the success case; errors flow through rejection. Don't try to encode error types in the return — TS has no checked exceptions. If the function uses Result/Either patterns (e.g. `Effect.Effect<A, E>`), use the library's full type.

## Common mistakes

- **Don't annotate `: any`.** If the inferred type is `any`, FIX the source of the `any` first — annotating the boundary as `any` propagates unsafety.
- **Don't annotate `: void` on a function that actually returns something.** Trust the inference; annotate what TS shows you.
- **Don't use `as` to coerce a wider type at the boundary.** If the body really returns a narrower type, the annotation should be narrower.
