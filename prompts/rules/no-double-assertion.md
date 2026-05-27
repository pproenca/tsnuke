# no-double-assertion

`value as unknown as Foo` is the type-system equivalent of "shut up". It bypasses even TS's own check that the cast is *at least plausible*. If you need a double-assertion, the source type and target type don't overlap at all — which means either the source is mis-typed, or the runtime really might not be `Foo`.

## Validation prompt

**Suppress only when** ALL of these hold:

- **The source type is genuinely opaque** (a third-party API typed as `unknown` you can't change), AND
- **You can't validate at runtime** because the cast happens in a hot path AND validation already happened elsewhere AND threading the validated type would be a multi-file refactor.

In practice this is rare. The rule fires as an **error** (not warning) for a reason: most double-assertions are bugs in disguise.

## Fix prompt

### Path A — use a parser

If the source is `unknown` from `JSON.parse` / network / IPC:

```ts
// Before
const config = JSON.parse(text) as unknown as AppConfig;

// After
import { z } from "zod";
const AppConfigSchema = z.object({ /* … */ });
const config = AppConfigSchema.parse(JSON.parse(text));
```

### Path B — narrow with a type predicate

```ts
// Before
function notify(payload: unknown) {
  const event = payload as unknown as DomEvent;
  emit(event);
}

// After
function isDomEvent(p: unknown): p is DomEvent {
  return typeof p === "object" && p !== null && "kind" in p && typeof (p as { kind?: unknown }).kind === "string";
}
function notify(payload: unknown) {
  if (!isDomEvent(payload)) throw new TypeError("expected DomEvent");
  emit(payload);
}
```

### Path C — fix the source type

If the cast exists because the source is typed too loosely, fix the source:

```ts
// Before — `deps.config` typed as `Record<string, unknown>`
function init(deps: Deps) {
  const cfg = deps.config as unknown as AppConfig;
}

// After — type `deps.config` properly
interface Deps {
  config: AppConfig;
  // …
}
function init(deps: Deps) {
  const cfg = deps.config;
}
```

This is usually the right fix when the call site is yours.

### Path D — single assertion if the cast is structurally plausible

If TS's complaint can be resolved with a SINGLE `as Foo` (no need for `unknown` bridge), use that — but treat it as an opportunity to consider Paths A-C first.

## Common mistakes

- **Don't replace `as unknown as Foo` with `as Foo`** without checking — TS rejects the single-cast for a reason (the types don't overlap). The fix is to make them overlap, not to layer another lie.
- **Don't add a `// @ts-expect-error`** to silence the rule — that's the rule complaining in a different form.
- **Don't fix this in production code without writing a test** that verifies the runtime shape really is what you're asserting.
