import ts from "typescript";
import { defineRule } from "@tsnuke/rules-core-effect";

/**
 * TYP (Tier-2, type-aware) — flag `for (const k in arr)` where `arr` is an
 * array(-like). Google TS Style Guide: "Do not use `for (... in ...)` to iterate
 * over arrays as it will counterintuitively give the array's indices (as
 * strings!), not values." Worse, `for...in` also walks enumerable inherited /
 * monkey-patched keys, so it's a correctness footgun, not just an ergonomics one.
 * Use `for...of` for values, or `arr.entries()` / `keys()` for indices.
 *
 * Deciding whether the iterated expression is an array needs the checker, so the
 * body early-returns without one (Tier-1 / broken-project path) — `runRule` (no
 * checker) therefore yields nothing.
 */

/** True if `type` (or every constituent of a union) is an array / tuple. */
function isArrayLike(type: ts.Type, checker: ts.TypeChecker): boolean {
  const parts = type.isUnion() ? type.types : [type];

  // `any` / `unknown` / type params — can't be sure it's an array. Bail (no FP).
  const imprecise =
    ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter;
  if (parts.some((p) => p.flags & imprecise)) return false;

  // `null` / `undefined` constituents don't affect array-ness; skip them.
  const nullish = ts.TypeFlags.Null | ts.TypeFlags.Undefined;
  const relevant = parts.filter((p) => (p.flags & nullish) === 0);

  const isArr = (p: ts.Type): boolean =>
    checker.isArrayType(p) ||
    checker.isTupleType(p) ||
    // readonly arrays / array-likes: numeric index + a numeric `length`.
    (p.getNumberIndexType() !== undefined && hasNumberLengthProp(p, checker));

  // At least one array, and every non-nullish part is an array.
  return relevant.length > 0 && relevant.every(isArr);
}

/** True if the type has a `length` property whose type is number-like. */
function hasNumberLengthProp(type: ts.Type, checker: ts.TypeChecker): boolean {
  const len = type.getProperty("length");
  if (len === undefined) return false;
  const lenType = checker.getTypeOfSymbol(len);
  return (lenType.flags & ts.TypeFlags.NumberLike) !== 0;
}

export const rule = defineRule(
  {
    id: "no-for-in-array",
    severity: "error",
    category: "Exhaustiveness & Narrowing",
    tier: "TYP",
    requires: ["typecheck:ok"],
    fixKind: "manual",
    tags: ["ts-idiom"],
    recommendation:
      "Don't use `for...in` over an array — it yields string indices (and any enumerable inherited keys), not values. Use `for (const v of arr)` for values, or `arr.entries()` / `arr.keys()` when you need indices.",
  },
  () => ({
    [ts.SyntaxKind.ForInStatement]: (node, ctx) => {
      const checker = ctx.checker;
      if (checker === undefined) return; // Tier-1 / no type info — cannot decide.
      if (!ts.isForInStatement(node)) return;

      const type = checker.getTypeAtLocation(node.expression);
      if (!isArrayLike(type, checker)) return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } =
        ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: "`for...in` over an array yields string indices, not values.",
        help: "Use `for (const v of arr)` to iterate values, or `arr.entries()` / `arr.keys()` for indices.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
