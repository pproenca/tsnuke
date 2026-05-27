# no-floating-promises

A `Promise` whose rejection nobody handles can crash the process (Node 15+ default), leak resources, or silently lose work. Floating promises are one of the highest-value rules to keep clean.

## Validation prompt

**Almost always apply the fix.** This is a TYP-tier rule that requires `typecheck:ok` to run, and the false-positive rate is very low.

**Suppress only when**:

- **Intentional fire-and-forget logging / telemetry** — `logger.warn("foo")` that returns a Promise nobody waits on. Even here, `void logger.warn(...)` is the conventional way to signal intent (and silences the rule).
- **`addEventListener("...", async handler)`** — the listener returns a Promise the DOM ignores. Browser convention; can't be helped. Suppress with `void` at the body.

## Fix prompt

Three patterns by intent.

### Pattern A — you meant to wait

By far the most common. Add `await`:

```ts
// Before
async function save(record: Record) {
  db.write(record); // floats
}

// After
async function save(record: Record) {
  await db.write(record);
}
```

If the caller isn't async, propagate:

```ts
function handler(req, res) {
  save(req.body); // floats inside a sync handler
}
// →
async function handler(req, res) {
  await save(req.body);
}
```

### Pattern B — you meant fire-and-forget, but errors still matter

Attach a `.catch` so a rejection doesn't crash the process:

```ts
// Before
emitTelemetry(event);

// After
emitTelemetry(event).catch((err) => log.error("telemetry failed", { err }));
```

### Pattern C — you really, really meant ignore

Use `void` to signal intent and silence the rule:

```ts
// Before
trackPageView(url);

// After
void trackPageView(url);
```

This pattern is appropriate ONLY when you've consciously decided rejection should be silent. It's not a quick fix — it's a contract.

### Pattern D — parallel work, awaited together

If multiple promises should run in parallel:

```ts
// Before — N floating promises in a loop
for (const id of ids) processOne(id);

// After
await Promise.all(ids.map(processOne));
```

(See also `no-await-in-loop` for the related anti-pattern.)

## Common mistakes

- **Don't add `.then(() => {})` to silence the rule** — that doesn't handle rejection either. Use `.catch` or `void`.
- **Don't wrap in `try/catch` without `await`** — synchronous try-catch doesn't catch async rejection. You need `await` inside the try block.
- **Don't drop the await on `expect(...).rejects.toThrow(...)`** — Vitest/Jest async matchers return a Promise that MUST be awaited or the assertion is skipped silently.
