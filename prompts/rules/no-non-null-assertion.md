# no-non-null-assertion

The postfix `!` asserts to TypeScript that a value is not `null`/`undefined` without proof. At runtime, it's a no-op. If the value IS nullish, you get a TypeError at the next property access, often far from the assertion site. The rule prefers explicit narrowing, default values, or invariants.

## Validation prompt

**Suppress when** ALL of these apply (otherwise apply the fix):

- **Test files** (`*.test.ts`, `*.spec.ts`, `__tests__/**`). `x!` in test code is the canonical "must be defined or this test should fail loudly" idiom — replacing it with `expect(x).toBeDefined()` then `x` adds verbose ceremony for zero safety gain in a test context.
- **The non-null is structurally proven nearby** but TS can't follow:
  - Right after a `if (!x) throw` / `assert(x)` / `invariant(x)` — TS often narrows, but if it doesn't (cross-method, captured callback), `!` is the pragmatic choice.
  - In a `Map.get` chain when a `has` check just happened. Modern TS narrows this; older code paths may not.
- **Library types that are wrong.** `Array.prototype.find` returns `T | undefined`; if you JUST `.includes`-checked the same key, `!` is fine.

**Apply the fix** in production code where there's no preceding check.

## Fix prompt

Three patterns. Pick by the surrounding code shape.

### Pattern A — there's an upstream check you can move down

```ts
// Before
const user = users.find(u => u.id === id);
if (!user) throw new Error("no user");
// … many lines …
return user!.name;

// After — narrow once, use narrowed binding
const user = users.find(u => u.id === id);
if (!user) throw new Error("no user");
return user.name; // narrowed by the if-throw above; no `!` needed
```

Or hoist the check:

```ts
// Before
function getName(user?: User) {
  return user!.name;
}
// After
function getName(user: User | undefined): string {
  if (!user) throw new Error("getName called with undefined user");
  return user.name;
}
```

### Pattern B — switch to an explicit fallback

```ts
// Before
const port = process.env.PORT!;
// After
const port = process.env.PORT ?? "3000";
```

For required env vars at startup, validate explicitly:

```ts
const port = process.env.PORT;
if (port === undefined) throw new Error("PORT is required");
```

### Pattern C — use optional chaining

```ts
// Before
const value = config!.feature!.enabled;
// After
const value = config?.feature?.enabled ?? false;
```

Note: optional chaining returns `undefined`, not the inner type. Pair with `??` if you need a non-nullable result.

## Common mistakes

- **Don't replace `!` with `as NonNullable<T>`** — that's the same lie wearing a different mask.
- **Don't add a runtime check that ALWAYS passes** (`if (x === undefined) throw …` immediately after `x` was created from a known-defined source). Read the value flow; if a check is genuinely unreachable, the `!` is a code smell pointing at over-typed inputs.
- **Don't bulk-replace `!` with `?? defaultValue`** — every call site has different intent (throw vs fallback vs early-return).
