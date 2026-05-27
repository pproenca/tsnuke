# no-unsafe-object-assertion

A pattern like `x as SomeShape` or `x as unknown as SomeShape` *claims* a type without proving it. At runtime, `x` could be anything; at type-check time, the compiler trusts the assertion and stops complaining. This rule fires on object-shape assertions that bypass validation — the kind that mask real bugs (a renamed API field, a missing optional, a wrong-shape mock).

## Validation prompt

**Apply the fix in most cases.** This rule's signal-to-noise is high; the patterns it flags are real type-safety holes worth closing.

**Suppress only when** ONE of these holds:

- **The shape was just validated** (zod, valibot, runtime check) and the cast is the conventional way to tell TS about the proof. Modern code should use `parse`'s return value directly instead of casting, but legacy `if (isFoo(x)) { use(x as Foo); }` patterns exist. If a type predicate is RIGHT ABOVE the cast in the same block, prefer the predicate path; if you can't (e.g. parser doesn't narrow), the cast is a false positive — surface the rule, but don't blindly remove.
- **Bridging to a typed library API** where the library's types don't reflect the runtime promise. Common with Sentry/PostHog event shapes, Inngest event payloads, custom event emitters. Note this as "library type debt" rather than fixing locally.
- **Test fixtures** that intentionally construct partial mocks (`as User`, `as Partial<User>` for one). Tests are allowed to lie about shapes; production code is not. Skip in `*.test.ts` / `*.spec.ts`.

## Fix prompt

Two paths depending on the data origin.

### Path A — runtime data (JSON, network, env, dynamic imports)

Use a parser. zod is the standard; valibot / arktype / superstruct work the same way.

```ts
// Before
const config = JSON.parse(text) as AppConfig;

// After
import { z } from "zod";
const AppConfigSchema = z.object({ /* … */ });
const config = AppConfigSchema.parse(JSON.parse(text));
```

`parse` throws on shape mismatch; `safeParse` returns a Result. Pick based on whether a malformed input is recoverable.

### Path B — programmatic data (within your own code)

Either narrow with a type predicate or restructure the source so the cast isn't needed.

#### Type predicate (when the data really is unverified):

```ts
// Before
const cfg = (deps.config as { feature: { enabled: boolean } }).feature;

// After
function hasFeatureFlag(c: unknown): c is { feature: { enabled: boolean } } {
  return typeof c === "object" && c !== null && "feature" in c &&
         typeof (c as { feature?: unknown }).feature === "object";
}
if (!hasFeatureFlag(deps.config)) throw new Error("config: missing feature flag");
const cfg = deps.config.feature;
```

#### Restructure (when the source is your own code):

If the cast exists because `deps.config` is typed too loosely, FIX the type of `deps.config` upstream. A cast at the call site is treating a type-system smell instead of fixing it.

### Path C — `as unknown as T` (double-assertion)

This is the "shut up" variant; it bypasses TS's own check that the cast is at least *plausible*. Always investigate. Either:
- The source type is wrong → fix the source type.
- The runtime really might be different shape → use a parser (Path A).
- It's a test fixture → fine, skip (see Validation prompt).

## Common mistakes

- **Don't replace `as Foo` with `as unknown as Foo`** to silence the rule — that's worse.
- **Don't write a type predicate that lies.** `function isFoo(x: unknown): x is Foo { return true; }` is the same hole, just dressed up.
- **Don't put the parser in a hot loop** — parse once at the boundary, propagate the typed value inward.
