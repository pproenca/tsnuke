# no-record-string-unknown

`Record<string, unknown>` is a typed bag — any key, any value. It's a tiny step above `any` and a big step below "this is a User". The rule prefers either a named shape (`interface`/`type`), a Map with a value type, or a runtime parser if the data is genuinely unknown.

## Validation prompt

**Suppress when**:

- **The shape is genuinely open** by design: a metadata bag, an arbitrary JSON blob a user can populate, a key-value store cache, OpenTelemetry attributes, Sentry context. Anything with "metadata", "extra", "tags", "context", "props bag" semantics.
- **You're at the wire boundary** about to validate — `JSON.parse` returns `unknown` and the next line is `Schema.parse(parsed)`. The type before the parse is irrelevant. (The `as Record<string, unknown>` between parse and schema is unnecessary; consider removing the cast entirely and letting zod's input type drive it.)
- **Logger / telemetry method signatures** where structured fields are the API: `log.info(msg, attrs: Record<string, unknown>)`. The type IS the contract.

**Apply the fix** when the data has a knowable shape and `Record<string, unknown>` is hiding it.

## Fix prompt

Three paths.

### Path A — name the shape

The most common case. If the object is constructed at call sites with known keys, define an `interface`/`type` for it:

```ts
// Before
function processEvent(payload: Record<string, unknown>): void {
  const id = payload.id;  // type: unknown — every use needs a check
}

// After
interface EventPayload {
  id: string;
  userId: string;
  timestamp: number;
  metadata?: Record<string, unknown>;  // OK — this part really IS open
}
function processEvent(payload: EventPayload): void {
  const id = payload.id;  // type: string
}
```

### Path B — use a typed Map

If the keys are dynamic but values share a shape:

```ts
// Before
const cache: Record<string, unknown> = {};
cache[userId] = await fetchUser(userId);

// After
const cache = new Map<string, User>();
cache.set(userId, await fetchUser(userId));
```

`Map` is grep-friendly (`cache.get`, `cache.set`), iterable, and value-typed.

### Path C — keep `Record` but tighten the value type

If keys are open but values are uniform:

```ts
// Before
const featureFlags: Record<string, unknown> = config.flags;

// After
const featureFlags: Record<string, boolean> = config.flags;
```

If the source is `unknown`, validate first with zod's `z.record(z.boolean())`.

## Common mistakes

- **Don't replace `Record<string, unknown>` with `Record<string, any>`** — that's worse. The whole point is to add specificity.
- **Don't define a giant `interface` with 50 optional fields** just to avoid `Record`. If the shape is genuinely sparse and call sites differ, a discriminated union or a `Map` is cleaner.
- **Don't change a public API's parameter type without a deprecation path** — `Record<string, unknown>` parameters are common in framework APIs. Add a typed overload, don't replace.
