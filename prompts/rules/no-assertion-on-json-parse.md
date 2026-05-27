# no-assertion-on-json-parse

`JSON.parse(text) as Foo` is a lie. `JSON.parse` returns `unknown` because the JSON might be ANY valid JSON value; the type assertion bypasses every check that the result is actually `Foo`. The rule prefers runtime validation (zod, valibot) before the cast.

## Validation prompt

**Suppress when**:

- **The JSON source is byte-pinned** to a known shape — e.g. you're parsing a string YOU just `JSON.stringify`-ed, locally, in the same function. Even here, prefer not to round-trip if you don't have to.
- **Test fixtures** where parsing a hand-written test string into a known shape is fine.

**Apply the fix** for any production parse where the JSON source is untrusted: network responses, file reads, env vars, IPC payloads, user input.

## Fix prompt

Use a schema validator. zod is the standard; valibot / arktype / superstruct work the same.

```ts
// Before
const config = JSON.parse(text) as AppConfig;

// After
import { z } from "zod";
const AppConfigSchema = z.object({
  port: z.number(),
  host: z.string(),
  features: z.array(z.string()),
});
const config = AppConfigSchema.parse(JSON.parse(text));
```

Subtleties:

### `parse` vs `safeParse`

- `parse` throws on shape mismatch — appropriate when a bad payload SHOULD crash this code path (e.g. config file at startup).
- `safeParse` returns `{ success, data, error }` — appropriate when the caller should handle a malformed payload gracefully (e.g. a network response).

### Schema lives at module top-level, not in the function body

Schemas have setup cost. Define at module scope; reuse on every parse:

```ts
const ConfigSchema = z.object({ /* … */ });

function loadConfig(text: string): Config {
  return ConfigSchema.parse(JSON.parse(text));
}
```

### Existing types → derive the schema

If `AppConfig` is already a TS type and rewriting it as zod feels wasteful, consider deriving instead:

```ts
import { z } from "zod";

const AppConfigSchema = z.object({
  port: z.number(),
  host: z.string(),
}) satisfies z.ZodType<AppConfig>;
```

(The `satisfies` ensures the schema and type stay aligned.)

## Common mistakes

- **Don't replace `as Foo` with `as unknown as Foo`** — that's worse.
- **Don't validate AFTER using the parsed value** — validate immediately at the parse, propagate the validated type inward.
- **Don't catch+rethrow the validation error generically** — surface a useful message: include which field failed, what was received.
