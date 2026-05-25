import ts from "typescript";
import { defineRule } from "@ts-fix/rules-core-effect";

/**
 * TYP (Tier-2, type-aware) — require a `switch` over a union of literals (or an
 * enum) to handle every member, or to carry a `default` branch.
 *
 * Registered with `tier:"TYP"` and `requires:["typecheck:ok"]`; activates only
 * under a clean type-check (BC-10). Enumerating the discriminant's full member
 * set requires the `ts.TypeChecker`, so the body early-returns without one
 * (Tier-1 / broken-project path). Conservative by design: it only reports when
 * EVERY union constituent is a string/number literal it can reason about — a
 * non-literal member makes it bail rather than risk a false positive.
 */

type LiteralValue = string | number;

/** Literal value of a type, or null if it isn't a string/number literal. */
function literalValue(type: ts.Type): LiteralValue | null {
  if (type.isStringLiteral() || type.isNumberLiteral()) return type.value;
  return null;
}

/** Collect literal values of a (possibly union) type, or null if any member isn't a literal. */
function literalMembers(type: ts.Type): Set<LiteralValue> | null {
  const parts = type.isUnion() ? type.types : [type];
  const values = parts.map(literalValue);
  // A non-literal constituent — can't reason exhaustively.
  if (values.some((v) => v === null)) return null;
  const set = new Set(values as LiteralValue[]);
  return set.size > 0 ? set : null;
}

export const rule = defineRule(
  {
    id: "switch-exhaustiveness-check",
    severity: "error",
    category: "Exhaustiveness & Narrowing",
    tier: "TYP",
    requires: ["typecheck:ok"],
    fixKind: "codemod",
    tags: ["exhaustiveness", "correctness"],
    recommendation:
      "Handle every member of the switched union/enum (add the missing `case`s) or add a `default` branch with a `never` exhaustiveness check.",
  },
  () => ({
    [ts.SyntaxKind.SwitchStatement]: (node, ctx) => {
      const checker = ctx.checker;
      if (checker === undefined) return; // Tier-1 / no type info — cannot decide.
      if (!ts.isSwitchStatement(node)) return;

      const discriminantType = checker.getTypeAtLocation(node.expression);
      const members = literalMembers(discriminantType);
      if (members === null) return; // not a literal union — out of scope.

      const clauses = node.caseBlock.clauses;
      if (clauses.some((c) => ts.isDefaultClause(c))) return; // a default branch makes it exhaustive by construction.

      const handled = new Set<LiteralValue>(
        clauses
          .filter(ts.isCaseClause)
          .map((c) => literalValue(checker.getTypeAtLocation(c.expression)))
          .filter((v): v is LiteralValue => v !== null),
      );

      const missing = [...members].filter((m) => !handled.has(m));
      if (missing.length === 0) return;

      const start = node.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      const missingList = missing
        .map((m) => (typeof m === "string" ? `"${m}"` : String(m)))
        .join(", ");
      ctx.report({
        filePath: ctx.filePath,
        message: `Non-exhaustive switch: missing case(s) ${missingList}.`,
        help: "Add the missing case(s), or a `default` branch (ideally with a `never` exhaustiveness assertion).",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
