# no-unsafe-member-access

`x.y` where `x` is typed `any` is an unsafe member access — TS can't check that `y` is a property of `x`. The actual `any` is the root cause; the member access is just where the bug shows up.

## Validation prompt

A TYP-tier rule, runs only when `typecheck:ok`. False-positive rate is low.

**Suppress only when** the `any` source is documented (untyped library) and you're at the boundary.

## Fix prompt

Trace the `any` to its source, fix THAT — usually a `JSON.parse`, an untyped import, or a too-loose function parameter. (See `no-explicit-any` for the source-side fix.)

### Most common: tighten the source

```ts
// Before
const data: any = await fetchSomething();
const id = data.user.id;  // unsafe member access x2

// After
import { z } from "zod";
const Schema = z.object({ user: z.object({ id: z.string() }) });
const data = Schema.parse(await fetchSomething());
const id = data.user.id;  // typed end-to-end
```

### When you can't change the source

Narrow at the use site:

```ts
// Before
function describe(obj: any): string {
  return obj.name;  // unsafe
}

// After
function describe(obj: unknown): string {
  if (typeof obj !== "object" || obj === null || !("name" in obj)) {
    throw new TypeError("expected { name }");
  }
  return String((obj as { name: unknown }).name);
}
```

## Common mistakes

- **Don't `as any` the access** to silence it — that's the same hole.
- **Don't fix the symptom by adding `?.`** — `any?.foo` is still `any`. Optional chaining doesn't introduce narrowing.
- **Don't suppress without fixing the `any` source** unless you've added a comment explaining why the `any` is unavoidable.
