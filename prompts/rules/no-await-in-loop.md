# no-await-in-loop

`await` inside a `for` / `while` / `for-of` loop serializes the iterations. If the work is independent (each iteration doesn't depend on the previous), `Promise.all` is faster.

## Validation prompt

**Suppress when** serialization is INTENDED:

- **Cutover / migration scripts** that mutate shared state in a specific order. Parallelism would race.
- **Rate-limited APIs** — `await this.api.call(x); await sleep(rateLimit);` is the canonical "respect the rate limit" pattern.
- **Streaming consumption** — reading from an async iterator with `for await (const x of stream)` is correct sequential consumption, not the anti-pattern this rule targets.
- **Database transactions** where one statement's result feeds the next.
- **DI bootstrap / service start-up** — services that genuinely depend on the previous one being live.
- **Sequential file ops** that must respect filesystem ordering (atomicity-by-sequence, not by atomic write).

If the comment above the loop says "do these in order" or the call sites depend on each other, **skip**.

**Apply the fix** when each iteration is independent — most data-transform loops, fetch-then-process loops, etc.

## Fix prompt

### Pattern A — collect with map + Promise.all

```ts
// Before
const users: User[] = [];
for (const id of userIds) {
  users.push(await fetchUser(id));
}

// After
const users = await Promise.all(userIds.map(fetchUser));
```

### Pattern B — settle even on rejection

```ts
// Before
const results = [];
for (const id of ids) {
  try { results.push(await fetchUser(id)); }
  catch (e) { results.push({ error: e }); }
}

// After
const results = await Promise.allSettled(ids.map(fetchUser));
```

### Pattern C — parallel with concurrency limit

If you need parallelism but not unbounded (don't spawn 10,000 concurrent fetches):

```ts
// Use p-limit (or the project's chosen concurrency lib):
import pLimit from "p-limit";
const limit = pLimit(10);
const users = await Promise.all(userIds.map((id) => limit(() => fetchUser(id))));
```

## Common mistakes

- **Don't switch a transaction-sequenced loop to `Promise.all`** — you'll race and corrupt state.
- **Don't switch a rate-limited loop to `Promise.all`** — you'll trip the limit and 429 immediately.
- **Don't apply this in startup orchestration** unless you've verified the services are independent.
- **Don't drop the `await` on the result** — `Promise.all` returns a Promise, you still need to await it.
