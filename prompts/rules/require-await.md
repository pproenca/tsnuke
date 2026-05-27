# require-await

An `async` function with no `await` is misleading: it returns a `Promise` for no reason, hides synchronous semantics behind asynchronous shape, and forces callers to `await` something that has no asynchronous work to do.

## Validation prompt

**Suppress when** the function shape is contractually `Promise`-returning even when one branch happens to be synchronous:

- **Interface conformance.** An interface declares `(): Promise<T>` and one implementation happens to be sync. Removing `async` would break the contract. Suppress when the function implements an interface / abstract method / function type the broader system expects to be async.
- **Polymorphic callers.** A `Map<string, () => Promise<T>>` registry whose entries the calling code uniformly awaits. Removing `async` from one entry would force a `Promise.resolve()` wrap at the call site — net zero gain.
- **Future-proofing for I/O.** A method on a repository / service class where all siblings are async (and this one MIGHT need to be in a future implementation). Worth keeping async for consistency; the rule's complaint is correct but the alternative is worse churn.
- **Test fixtures** mimicking real async APIs.

For framework callbacks (Hono, Express, Next.js route handlers) — these are typically already async. If this one isn't, removing `async` is fine, the framework awaits the return value.

**Apply the fix** for plain library functions where async is a misleading shape choice.

## Fix prompt

Two paths depending on the body shape.

### Path A — strip `async`

If the function has zero `await` and zero `for await`:

```ts
// Before
export async function deriveId(payload: { id: string }): Promise<string> {
  return payload.id.trim().toLowerCase();
}

// After
export function deriveId(payload: { id: string }): string {
  return payload.id.trim().toLowerCase();
}
```

Then update callers: drop the `await`. `tsc --noEmit` will surface any caller that was awaiting the (now-sync) result.

### Path B — add the missing `await`

If a `Promise` is being created/passed inside the body but not awaited, the function probably *intended* to await it:

```ts
// Before
export async function save(record: Record): Promise<void> {
  db.write(record); // returns a Promise — fire-and-forget bug!
}

// After
export async function save(record: Record): Promise<void> {
  await db.write(record);
}
```

This is often a real bug masquerading as a style issue. Read the body carefully before stripping `async`.

### Path C — keep `async`, document why

If the Validation prompt's "interface conformance" or "polymorphic callers" applies, the function is correctly async-by-contract. Add a one-line comment and a `tsnuke-disable-next-line` directive:

```ts
// Interface implementation; siblings are genuinely async.
// tsnuke-disable-next-line require-await
async getById(id: string): Promise<User> {
  return USERS.find(u => u.id === id)!;
}
```

## Common mistakes

- **Don't replace `async` with `Promise.resolve(...)` wrappers.** That's worse — same overhead, less clear.
- **Don't strip `async` from a function that calls `.then()` on its result internally.** The `.then` callback returns a Promise that should be awaited; the fix is to `await`, not to remove `async`.
- **Don't fix this in a bulk sweep.** Path A and Path B are visually similar; one's a noop refactor, the other's a real bug fix. Read each body before deciding.
