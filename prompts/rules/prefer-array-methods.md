# prefer-array-methods

Imperative `for`-loops that build an accumulator can be rewritten with `.map` / `.filter` / `.reduce` / `.flatMap`. The functional form is shorter, more declarative, and reads as "I'm transforming a list" instead of "I'm pushing to an array".

## Validation prompt

**Suppress when** the imperative form is genuinely clearer:

- **Multi-output loops** — one pass producing two arrays + a counter + a side-effect log. Splitting into 4 array methods is worse than one loop.
- **Early-exit loops** with `break` / `return` mid-iteration. `.find` / `.some` / `.every` cover some cases, but if the early-exit logic is complex, a `for-of` with break is cleaner.
- **Performance-critical hot paths** — array methods allocate intermediate arrays; a tight loop avoids that. Profile first.
- **Iteration with index that depends on previous iteration's accumulator state** in a way `.reduce` would obscure.
- **Ops scripts and one-shot migrations** — `for` loops are fine here; the code lives briefly.

**Apply the fix** when the loop is a clear "transform every element" or "filter to a subset" or "sum/group/count" shape.

## Fix prompt

### Transform — use `.map`

```ts
// Before
const names: string[] = [];
for (const user of users) {
  names.push(user.name);
}

// After
const names = users.map((user) => user.name);
```

### Filter — use `.filter`

```ts
// Before
const active: User[] = [];
for (const user of users) {
  if (user.active) active.push(user);
}

// After
const active = users.filter((user) => user.active);
```

### Filter + transform — chain

```ts
// Before
const activeNames: string[] = [];
for (const user of users) {
  if (user.active) activeNames.push(user.name);
}

// After
const activeNames = users.filter((u) => u.active).map((u) => u.name);
```

### Sum / fold — use `.reduce`

```ts
// Before
let total = 0;
for (const item of items) total += item.amount;

// After
const total = items.reduce((sum, item) => sum + item.amount, 0);
```

### Group — use `.reduce` or `Object.groupBy`

```ts
// Before
const byKind: Record<string, Item[]> = {};
for (const item of items) {
  (byKind[item.kind] ??= []).push(item);
}

// After (Node 21+ / ES2024)
const byKind = Object.groupBy(items, (item) => item.kind);
// or with .reduce
const byKind = items.reduce<Record<string, Item[]>>((acc, item) => {
  (acc[item.kind] ??= []).push(item);
  return acc;
}, {});
```

### Flat-map — use `.flatMap`

```ts
// Before
const childIds: string[] = [];
for (const parent of parents) {
  for (const child of parent.children) childIds.push(child.id);
}

// After
const childIds = parents.flatMap((p) => p.children.map((c) => c.id));
```

## Common mistakes

- **Don't replace a loop with `.forEach`** — that has the same readability as a `for-of` and doesn't return a value. Use `.map`/`.filter`/`.reduce` for actual transformation.
- **Don't use `.reduce` to push to an outer array** — the side-effect inside the reducer defeats the purpose; just keep the loop.
- **Don't apply this rule when the imperative form is explicitly chosen for clarity in domain code** — the rule is a heuristic.
