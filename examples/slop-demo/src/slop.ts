// A field guide to TypeScript "AI slop": work delegated to runtime / boilerplate
// that the type system, native methods, or modern idioms should carry.

declare const label: string;
declare const raw: string;

// 1. Redundant `typeof` — the type already guarantees `string`.
export function f1(): boolean {
  return typeof label === "string"; // no-unnecessary-typeof + prefer-type-guard-predicate
}

// 2. Redundant `instanceof` — `foo` is already a `Foo`.
class Foo {
  hi(): void {}
}
declare const foo: Foo;
export function f2(): void {
  if (foo instanceof Foo) {
    // no-unnecessary-instanceof
    foo.hi();
  }
}

// 3. A type guard that returns `boolean`, throwing away its narrowing.
export function isString(v: unknown): boolean {
  // prefer-type-guard-predicate
  return typeof v === "string";
}

// 4. Hand-rolled accumulation loop instead of a native array method.
export function doubled(xs: number[]): number[] {
  const out: number[] = [];
  for (const x of xs) {
    out.push(x * 2); // prefer-array-methods
  }
  return out;
}

// 5. Deep clone delegated to serialization.
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)); // no-json-parse-stringify-clone
}

// 6. Asserting a type onto unvalidated parsed data (validation skipped).
export const config = JSON.parse(raw) as { port: number }; // no-assertion-on-json-parse

// 7. `as` on a literal where `satisfies` belongs (modern TS).
export const settings = { port: 3000 } as { port: number }; // prefer-satisfies-over-as

// 8. Manual type-discrimination — the variant selection belongs in the type.
declare const shape: string | number;
export function classify(): string {
  if (typeof shape === "string") {
    return "str";
  } else if (typeof shape === "number") {
    return "num"; // prefer-discriminated-union (whole chain)
  }
  return "?";
}

// 9. `any` passed straight through — erases the caller's type.
export function passthrough(value: any): any {
  return value; // prefer-generic-over-any-passthrough
}
