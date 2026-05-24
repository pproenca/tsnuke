import type { a } from "./a.js";

// Closes the cycle b → a (type-only is enough to form the import edge).
export type ANumber = ReturnType<typeof a>;

export function b(): number {
  return 2;
}
