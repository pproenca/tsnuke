# consistent-type-definitions

Prefer `interface` over `type` for object shapes. `interface` is open for declaration merging, plays nicely with inheritance, has better error messages, and is the conventional choice in the TypeScript ecosystem for object types.

## Validation prompt

**Suppress when** the alias type CANNOT be expressed as an interface:

- **Union / intersection types**: `type Foo = A | B` or `type Foo = A & B` — interface can extend, but the alias form is the canonical "this is a union" signal.
- **Mapped types**: `type Partial<T> = { [K in keyof T]?: T[K] }` — interfaces can't do `keyof` mapping at the declaration site.
- **Conditional types**, **template-literal types**, **tuple types**, **function-only types** that aren't extending an object.
- **Branded types**: `type UserId = string & { __brand: "UserId" }` — needs the intersection form.

**Apply the fix** when the type alias is a plain object literal: `type Foo = { a: string; b: number }`.

## Fix prompt

This rule is **codemoddable** — `tsnuke --fix` will apply the transform when the alias is a plain object literal. Otherwise, do it by hand:

```ts
// Before
export type User = {
  id: string;
  name: string;
  age?: number;
};

// After
export interface User {
  id: string;
  name: string;
  age?: number;
}
```

Two subtleties:

### Generic type → generic interface

```ts
// Before
type Box<T> = { value: T };
// After
interface Box<T> { value: T; }
```

### Extends → extends

```ts
// Before
type Admin = User & { permissions: string[] };
// After (only if `User` is also an interface or class)
interface Admin extends User { permissions: string[]; }
```

If `User` is a non-interface type (a union, etc.), you cannot extend it cleanly with `interface`. Keep the `type` form and suppress.

## Common mistakes

- **Don't convert intersection types `&` to `interface extends` without checking the right-hand side** — only works when the parent is itself extendable.
- **Don't convert a publicly-exported `type` to `interface` in a `.d.ts` you don't fully own** — it might break downstream's declaration-merging expectations either way.
- **Don't drop the `export` keyword** in the conversion — both `export type Foo` and `export interface Foo` work; preserve.
