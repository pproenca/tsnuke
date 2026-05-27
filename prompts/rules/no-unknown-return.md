# no-unknown-return

A function annotated `: unknown` is opting out of communicating its real return type. Either the function genuinely doesn't know what it returns (then maybe it shouldn't exist), or the return type is knowable and should be named.

## Validation prompt

**Suppress when** `unknown` is honest:

- **Recursive JSON / data transformers** where each branch genuinely returns a structurally-different value tracked by `unknown`. Most JSON cleaners, deep-clone helpers with mixed result types, and recursive normalizers.
- **Parser/validator outputs** that are intentionally `unknown` for the caller to narrow: `JSON.parse` returns `unknown`; a thin wrapper around it returning `unknown` is correct.
- **Generic identity functions** typed `<T>(x: T): T` — the rule shouldn't fire here, but if it does (false positive), surface it.
- **Plugin / event handler returns** where the public contract is "anything goes" (e.g. Sentry beforeSend hooks).

**Apply the fix** when the function has a knowable shape but the author chose `unknown` instead of naming it.

## Fix prompt

### Path A — name the type

Most common case. The body's actual return shape is knowable; name it:

```ts
// Before
export function getUserPayload(id: string): unknown {
  return db.find(id);
}

// After
export function getUserPayload(id: string): User | null {
  return db.find(id);
}
```

### Path B — use a generic if the type varies by call site

```ts
// Before
function deserialize(text: string): unknown {
  return JSON.parse(text);
}

// After
function deserialize<T>(text: string, schema: z.ZodSchema<T>): T {
  return schema.parse(JSON.parse(text));
}
```

### Path C — keep `unknown`, add a comment

If the function genuinely doesn't know (recursive walker, generic JSON cleaner), document why and let the lint pass via `tsnuke-disable`:

```ts
// `Json` recurses through arrays/objects of itself; `unknown` is the precise
// return type the type system can express for a heterogeneous walker.
// tsnuke-disable-next-line no-unknown-return
function cleanJson(value: unknown): unknown {
  // …
}
```

## Common mistakes

- **Don't replace `: unknown` with `: any`** to silence the rule — that's the opposite of the goal.
- **Don't return `unknown` from a function whose body always returns one specific type** — read the body, pick the type, annotate.
