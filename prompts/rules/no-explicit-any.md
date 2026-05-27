# no-explicit-any

`any` opts out of TypeScript. A value typed `any` accepts and returns anything; the checker stops tracking it. One `any` in a hot path silently disables type-safety across every chain that flows through it.

## Validation prompt

**Suppress when** the `any` is at a genuine type-system boundary and there's no alternative:

- **Bridging an untyped library** with no `@types/*` package and no time to write one. Better: write a minimal `*.d.ts` next to the import. Suppression should be temporary.
- **Generic constraints where any other choice over-constrains**: `<T extends (...args: any[]) => any>(fn: T)` — the `any[]` here is the conventional way to accept "any function shape" because variance rules make `unknown[]` reject most real callbacks. The TS lib's own types use this pattern.
- **Test fixtures** where you're intentionally constructing malformed inputs.

In every other case, **apply the fix**.

## Fix prompt

Three paths by what `any` is hiding.

### Path A — switch to `unknown`

The default fix. `unknown` is the type-safe `any`: same "could be anything" semantics, but every use requires a narrow first.

```ts
// Before
function process(value: any): string {
  return value.trim();  // unsafe: value might not have .trim
}

// After
function process(value: unknown): string {
  if (typeof value !== "string") throw new TypeError("expected string");
  return value.trim();  // narrowed
}
```

`unknown` forces the caller (you) to deal with the uncertainty explicitly, which is the whole point.

### Path B — actually type it

Often `any` is laziness in disguise. Look at what the value really is at runtime — then write the type:

```ts
// Before
function transform(payload: any): { id: string } {
  return { id: payload.id };
}

// After
interface Payload {
  id: string;
  // … other fields
}
function transform(payload: Payload): { id: string } {
  return { id: payload.id };
}
```

If the source is `JSON.parse`, the type IS `unknown` — validate (see `no-unsafe-object-assertion`).

### Path C — generic instead of any

When `any` is masquerading as "any type the caller chooses", use a generic:

```ts
// Before
function identity(x: any): any { return x; }

// After
function identity<T>(x: T): T { return x; }
```

(See also `prefer-generic-over-any-passthrough`.)

### Path D — `Record<string, unknown>` for genuine bags

If `any` is hiding an open-shape object, use `Record<string, unknown>` and validate at use sites. (See also `no-record-string-unknown` — sometimes the fix is to name the shape.)

## Common mistakes

- **Don't replace `any` with `any | undefined`** or `any[]` — still `any`. The fix is `unknown`, not "any with extra steps".
- **Don't write `as any` casts after typing the parameter as `unknown`** — that defeats the purpose.
- **Don't add an `any` to a generic to silence the lint**: `<T = any>` is the same hole.
- **Don't fix `any` in tests bulk-style** — test mocks legitimately use `any` for shape-bending; focus on production code.
