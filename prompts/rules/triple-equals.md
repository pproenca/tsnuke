# triple-equals

`==` / `!=` perform type coercion (`0 == ""` is `true`, `null == undefined` is `true`). `===` / `!==` compare without coercion. Modern TypeScript code should always use the strict form unless there's a specific coercion the loose form is leveraging.

## Validation prompt

**Suppress when** the loose comparison is intentional:

- **`x == null`** as the canonical "is this nullish" check (matches both `null` and `undefined`). Modern code prefers `x === null || x === undefined` or `x == null` with a `// eslint-disable` directive — but `x ?? defaultValue` is usually a better expression.

In production code, almost everything else should switch to `===`.

## Fix prompt

This rule is **codemoddable** — `tsnuke --fix` swaps `==` → `===` and `!=` → `!==` automatically. Manual edits look like:

```ts
// Before
if (status == 200) { ... }
if (kind != "user") { ... }

// After
if (status === 200) { ... }
if (kind !== "user") { ... }
```

If you encounter genuine `x == null` shapes that were intentional, two options:

```ts
// Option A — use nullish coalescing
const value = input ?? defaultValue;

// Option B — explicit check
if (value === null || value === undefined) { ... }
```

## Common mistakes

- **Don't blindly replace `==` with `===` in `x == null` checks** without considering whether the intent was nullish-broad-check. Audit each one — the codemod is safe IF the surrounding behavior is known.
- **Don't fix this in `*.test.ts`** if Vitest/Jest matchers are involved (`expect(x).toEqual(y)` is different from `===`); the rule fires on raw `==` only.
