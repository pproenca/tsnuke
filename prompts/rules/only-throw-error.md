# only-throw-error

`throw "something went wrong"` (throwing a string, object literal, or anything that isn't an `Error` subclass) loses the stack trace, breaks `instanceof Error` checks in catch handlers, and tools like Sentry / DataDog can't classify the failure.

## Validation prompt

A TYP-tier rule, runs only when `typecheck:ok`.

**Suppress when**:

- **Throwing a `Promise` rejection inside an Effect/fp-ts/etc.** — these libraries have their own error channels. The rule may fire on `Effect.fail(value)` where value is an error class but the type-flow confuses the check.
- **Library convention** — e.g. an SDK that throws a typed object shape with a `code` field as its error contract. If `instanceof Error` is being explicitly avoided to enable destructure, document the choice.

In normal code, **apply the fix**.

## Fix prompt

### Path A — throw an Error subclass

```ts
// Before
if (!user) throw `no user: ${id}`;
if (status < 0) throw { code: "INVALID_STATUS", value: status };

// After
if (!user) throw new Error(`no user: ${id}`);
if (status < 0) throw new RangeError(`invalid status: ${status}`);
```

### Path B — define a typed Error class

If you need structured error data (a code, a payload, retry hints), subclass `Error`:

```ts
class NotFoundError extends Error {
  constructor(public readonly resource: string, public readonly id: string) {
    super(`${resource} not found: ${id}`);
    this.name = "NotFoundError";
  }
}

// Throw:
throw new NotFoundError("user", id);

// Catch + narrow:
try { … } catch (e) {
  if (e instanceof NotFoundError) {
    return res.status(404).json({ resource: e.resource });
  }
  throw e;
}
```

### Path C — Promise rejection with non-Error

If the code is `Promise.reject(value)` rather than `throw`, the rule may also fire. Same fix — reject with an Error:

```ts
// Before
return Promise.reject("not ready");
// After
return Promise.reject(new Error("not ready"));
```

## Common mistakes

- **Don't wrap a string in `new Error()` without context** — at minimum, include the operation that failed and any relevant ID. Stack traces don't show variable values.
- **Don't catch + rethrow with a new generic `Error`** — preserve the original via `Error.cause`:
  ```ts
  catch (e) { throw new Error("failed to save user", { cause: e }); }
  ```
- **Don't replace `throw obj` with `throw new Error(obj)`** — that stringifies the object weirdly. Use `JSON.stringify` or destructure into the message.
