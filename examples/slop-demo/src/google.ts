// Google TS Style Guide violations (language-features + type-system).

export const eq = (a: number, b: number): boolean => a == b; // triple-equals
export const arr = new Array(1, 2, 3); // no-array-constructor
export type Point = { x: number; y: number }; // consistent-type-definitions
export const count: number = 5; // no-inferrable-type-annotation
export const enum Direction { // no-const-enum
  Up,
  Down,
}
export let wrapped: Number = 1; // no-wrapper-object-types

export function boom(): never {
  throw Error("nope"); // prefer-error-instantiation
}

export function sum(xs: number[]): number {
  let total = 0;
  for (const k in xs) {
    // no-for-in-array (TYP)
    total += xs[Number(k)] ?? 0;
  }
  return total;
}
