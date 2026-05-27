# switch-exhaustiveness-check

A `switch` on a union type that doesn't cover every case is a maintenance bomb — when someone adds a new variant, the switch silently falls through to default (or doesn't run) and you get a wrong-shaped runtime result months later.

## Validation prompt

A TYP-tier rule, runs only when `typecheck:ok`. Almost always correct.

**Suppress when**:

- **The default case is the intended catch-all** AND the discriminator is open-ended (e.g. `kind: string` rather than a literal union). Reshape the type if you can; suppress otherwise.

## Fix prompt

Use a TypeScript `never` exhaustiveness check.

```ts
type Event =
  | { kind: "click"; x: number; y: number }
  | { kind: "scroll"; delta: number };

function handle(event: Event): string {
  switch (event.kind) {
    case "click": return `click at ${event.x},${event.y}`;
    case "scroll": return `scroll ${event.delta}`;
    default: {
      const _exhaustive: never = event;
      throw new Error(`unhandled event: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
```

When the union grows a new variant — `| { kind: "hover"; … }` — TS now refuses to assign `event` to `never` at the default case. You get a compile error pointing exactly at the missing case.

### Pattern matching libraries

If the codebase uses `ts-pattern` or similar, prefer that — it has built-in exhaustiveness:

```ts
import { match } from "ts-pattern";

const result = match(event)
  .with({ kind: "click" }, (e) => `click at ${e.x},${e.y}`)
  .with({ kind: "scroll" }, (e) => `scroll ${e.delta}`)
  .exhaustive();
```

## Common mistakes

- **Don't add a `default: return undefined`** — that's the silent-failure shape the rule is preventing.
- **Don't catch the error in the default** and ignore it — re-throw with the unhandled discriminator value so debugging is fast.
- **Don't add the exhaustiveness check at runtime only** (`throw new Error("unhandled")`) without the `const _exhaustive: never = …` line — the compile-time check is the actual safety; the throw is just to satisfy `noFallthroughCasesInSwitch`.
