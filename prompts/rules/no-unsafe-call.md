# no-unsafe-call

Calling a value typed `any` (or whose call signature is untyped) is unsafe — TS can't check the arguments or the return shape. The expression `someAny(arg1, arg2)` is a runtime crash waiting to happen if `someAny` isn't a function.

## Validation prompt

This is a TYP-tier rule that runs only when `typecheck:ok`. It catches real bugs almost every time it fires.

**Suppress only when**:

- **The source is an untyped third-party module** you've documented and can't fix. Write a `.d.ts` shim instead.
- **`Reflect.apply` / dynamic dispatch in a metaprogramming context** — frameworks like NestJS use these patterns intentionally. The fix is to type the metadata, not skip the rule.

## Fix prompt

Trace the `any` back to its source and narrow there.

### Common source: untyped destructure

```ts
// Before
const { handler } = await import("./plugin"); // handler: any
handler(req, res);  // unsafe call

// After
import type { Handler } from "./plugin-types";
const mod = (await import("./plugin")) as { handler: Handler };
mod.handler(req, res);
```

Better: type the module so the import isn't `any`:

```ts
// plugin.ts
export const handler: Handler = (req, res) => { /* … */ };
```

### Common source: `JSON.parse`

```ts
// Before
const config = JSON.parse(text);  // config: any
config.init();  // unsafe call

// After
const config: unknown = JSON.parse(text);
if (typeof config === "object" && config !== null && "init" in config &&
    typeof (config as { init?: unknown }).init === "function") {
  (config as { init: () => void }).init();
}
```

Or — much cleaner — parse with a schema (zod, valibot) that types it for you.

### Common source: function parameter typed `any`

```ts
// Before
function dispatch(handler: any, payload: any) {
  handler(payload);  // unsafe call
}

// After
function dispatch<P>(handler: (p: P) => void, payload: P) {
  handler(payload);  // typed: TS checks the call shape
}
```

## Common mistakes

- **Don't `as any` to silence the rule** — same hole.
- **Don't wrap in `try/catch`** — that catches the runtime crash but doesn't fix the type-system blindness. Catch at the right boundary (parse / IPC / network), not at every call site.
