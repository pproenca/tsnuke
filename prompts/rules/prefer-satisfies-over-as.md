# prefer-satisfies-over-as

`as Foo` *asserts* — TS trusts you. `satisfies Foo` *verifies* — TS checks the value conforms but keeps the precise inferred type. When you want both (the literal type AND the conformance check), `satisfies` is strictly better.

## Validation prompt

**Suppress when** ANY of these apply:

- **The value genuinely doesn't satisfy** the target type — you're really asserting, not verifying. (e.g. a partial mock in a test, or a known cast at a parser boundary.)
- **`as const` assertions** — different operator, different purpose.
- **Type-narrowing casts** like `value as Exclude<T, undefined>` — `satisfies` doesn't narrow.
- **`as never` escapes** in places where the type system genuinely can't see the unreachability.
- **CSS custom property strings** or other places where the literal looks like a valid value but TS's type for the target is too loose (e.g. `'--color': '#f00' as React.CSSProperties['color']`).

**Apply the fix** when you have a literal that:
1. You want TS to check matches a shape (the `as Foo` motivation), AND
2. You want to keep the precise inferred type for downstream use.

## Fix prompt

```ts
// Before
const config = {
  port: 3000,
  host: "localhost",
} as ServerConfig;
// `config.port` is now typed as the WIDE `ServerConfig['port']` (e.g. number), losing the literal `3000`.

// After
const config = {
  port: 3000,
  host: "localhost",
} satisfies ServerConfig;
// `config.port` is typed as `3000` literal — narrower AND verified.
```

### When the value is a function argument

```ts
// Before
emitEvent({ kind: "click", x: 10 } as DomEvent);

// After
emitEvent({ kind: "click", x: 10 } satisfies DomEvent);
```

If the shape is wrong, `satisfies` rejects it at the call site — exactly what you want.

### When refactoring a public API

If a `const x: T = ...` style annotation already exists and works, the rule probably isn't firing on it. The rule targets `as` casts specifically.

## Common mistakes

- **Don't replace `as` with `satisfies` blindly** — they have different semantics. `satisfies` will FAIL where `as` succeeded if the value doesn't actually conform.
- **Don't use `satisfies` when you need the WIDER type downstream** — `satisfies` keeps the narrow inferred type. If downstream code expects `ServerConfig`, that's an inferred-type conflict you'll have to resolve.
- **Don't apply this rule in test mocks** — tests often use `as` to construct partial objects for unit tests, where `satisfies` (strict conformance) would fail.
