# no-cast-in-return

`return value as Foo` lies to TS about what the function returns. The annotated return type already documents the contract; the cast at the return site silently broadens what the function *actually* produces.

## Validation prompt

**Suppress when** the cast is the only sane option:

- **Generic transformers** where the return is a structurally-different type the type system can't track end-to-end. Examples: recursive JSON cleaners (`Json` → `Json` where each branch is structurally identical), Sentry/event-scrubbing generics, type-level identity functions.
- **`as const` returns** — different operator, not the assertion form.
- **Branded-type construction** — `return raw as UserId` after validation is the canonical way to introduce a branded type. The validation gives the cast its safety; suppress at the function exit.
- **Library-bridging functions** that adapt one library's shape to another's stricter type with no runtime equivalent.

In every other case, **apply the fix**.

## Fix prompt

Two paths.

### Path A — change the return TYPE to match what you really return

Often the cast exists because the annotation is too narrow:

```ts
// Before
function getUser(id: string): User {
  const raw = db.lookup(id);  // returns User | null
  return raw as User;  // lying: could be null
}

// After
function getUser(id: string): User | null {
  return db.lookup(id);
}
// or, throw on null
function getUser(id: string): User {
  const raw = db.lookup(id);
  if (raw === null) throw new Error(`no user: ${id}`);
  return raw;
}
```

### Path B — narrow the value before returning

If the cast is hiding a known-good shape that TS can't see:

```ts
// Before
function asUserId(s: string): UserId {
  return s as UserId;  // unbranded cast
}

// After — validate, then cast as part of the branded constructor pattern
function asUserId(s: string): UserId {
  if (!UUID_REGEX.test(s)) throw new TypeError(`invalid UserId: ${s}`);
  return s as UserId;  // safe: validated
}
```

The cast HERE is justified by the validation directly above. The rule may still flag it; add an inline comment + `tsnuke-disable` directive.

### Path C — fix upstream

If multiple functions return `x as Foo` because `db.lookup` is typed as `unknown`, FIX `db.lookup` (or the layer that calls it) to return the precise type.

## Common mistakes

- **Don't change `return x as Foo` to `return x as unknown as Foo`** — same hole.
- **Don't add a runtime check that always passes** just to "earn" the cast.
- **Don't fix this in a recursive JSON-walker** unless you've understood the recursion shape — those genuinely need the cast (see Validation suppression list).
