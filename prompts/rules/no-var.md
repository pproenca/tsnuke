# no-var

`var` is function-scoped, hoisted, and silently shadows. `let` and `const` are block-scoped with predictable shadowing rules. Modern code never uses `var`.

## Validation prompt

**Suppress when** ... actually, there's no good reason. Even rare cases like polyfills should use `let` or `const`.

## Fix prompt

**Codemoddable** — `tsnuke --fix` does the conversion. Pick `const` over `let` whenever the binding is never reassigned (the common case).

```ts
// Before
var count = 0;
for (var i = 0; i < items.length; i++) {
  count += items[i].value;
}

// After
let count = 0;
for (let i = 0; i < items.length; i++) {
  count += items[i].value;
}
```

For non-reassigned bindings, prefer `const`:

```ts
// Before
var BASE_URL = "https://api.example.com";
// After
const BASE_URL = "https://api.example.com";
```

## Subtle case — variable used before declaration

`var` hoisting allowed:

```ts
console.log(x);  // undefined (not a crash)
var x = 1;
```

`let`/`const` reject this with a TDZ error:

```ts
console.log(x);  // ReferenceError
let x = 1;
```

If you encounter code relying on hoisting, the right fix is to MOVE the declaration up, not preserve `var`.

## Common mistakes

- **Don't replace every `var` with `let`** — most can be `const`. Default to `const`, downgrade only if you see a reassignment.
- **Don't preserve `var` "for compatibility"** — TS compiles `let`/`const` to whatever target you've configured.
