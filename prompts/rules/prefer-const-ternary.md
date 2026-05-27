# prefer-const-ternary

A `let x; if (cond) x = a; else x = b;` pattern can be a `const x = cond ? a : b;`. The const form prevents accidental reassignment, communicates "this is computed once", and reads as a single expression.

## Validation prompt

**Suppress when** the `let` is genuinely reassigned later in the function — the rule shouldn't fire in that case, but if it does, it's a false positive.

**Apply the fix** when the `let` is assigned exactly once via if/else (or switch with two branches).

## Fix prompt

This is **codemoddable** in the simple case — `tsnuke --fix` handles obvious if/else-into-ternary transforms. Manually:

```ts
// Before
let label: string;
if (count === 0) label = "empty";
else label = "non-empty";

// After
const label = count === 0 ? "empty" : "non-empty";
```

### Multi-branch — `switch` two-way

```ts
// Before
let icon: string;
switch (status) {
  case "ok": icon = "✓"; break;
  default: icon = "✗"; break;
}

// After
const icon = status === "ok" ? "✓" : "✗";
```

### Three+ branches — leave as switch

If the conditional has 3+ branches, a ternary chain becomes harder to read than the switch:

```ts
// LEAVE
let color: string;
switch (status) {
  case "ok": color = "green"; break;
  case "warn": color = "yellow"; break;
  case "err": color = "red"; break;
  default: color = "gray"; break;
}
```

A `switch` with a returned value or an IIFE is a fine pattern; don't force a multi-level ternary.

### When the branches have side effects

```ts
// LEAVE — not just a value assignment
let x: number;
if (a) {
  doThing();
  x = 1;
} else {
  doOtherThing();
  x = 2;
}
```

The rule shouldn't fire here, but if it does, suppress.

## Common mistakes

- **Don't force a ternary chain for 3+ branches** — readability drops fast.
- **Don't drop the type annotation** if it was load-bearing (e.g. widening the union type). The const form often infers narrower than the `let` annotation provided.
