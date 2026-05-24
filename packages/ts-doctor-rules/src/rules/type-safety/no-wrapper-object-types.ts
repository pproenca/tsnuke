import ts from "typescript";
import { defineRule } from "../../define-rule.js";
import type { RuleContext } from "../../define-rule.js";

/**
 * SYN — ban the boxed-primitive / overly-broad wrapper TYPES and the wrapper-
 * object CONSTRUCTORS.
 *
 * Google TS Style Guide:
 *  - "There are a few types related to JavaScript primitives that should not ever
 *    be used: `String`, `Boolean`, and `Number` … Always use the lowercase
 *    version" — same applies to `Symbol` / `BigInt`.
 *  - `Object` and the empty object type `{}` "should not" be used (they accept
 *    almost anything — type erasure); use `unknown` / `object` / `Record`.
 *  - The `Function` type is unsafe (any callable, returns `any`); use a precise
 *    signature.
 *  - "TypeScript code must not instantiate the wrapper classes for the primitive
 *    types `String`, `Boolean`, and `Number`." (`new String('x')` is an object,
 *    not a string — `typeof` is `"object"`, breaking comparisons.)
 *
 * All of these delegate the type's real shape away from the checker — classic
 * type-erasure slop. Conservative: we only flag a bare identifier type reference
 * (no type arguments) so e.g. a user-defined generic `Number<T>` is untouched.
 */

/** Capitalized wrapper / overly-broad identifiers banned as TYPE annotations. */
const BANNED_TYPE_NAMES = new Set([
  "String",
  "Boolean",
  "Number",
  "Symbol",
  "BigInt",
  "Object",
  "Function",
]);

/** Wrapper classes banned as runtime CONSTRUCTORS via `new`. */
const BANNED_CTOR_NAMES = new Set(["String", "Boolean", "Number"]);

const LOWERCASE: Record<string, string> = {
  String: "string",
  Boolean: "boolean",
  Number: "number",
  Symbol: "symbol",
  BigInt: "bigint",
};

function report(node: ts.Node, ctx: RuleContext, message: string, help: string): void {
  const start = node.getStart(ctx.sourceFile);
  const { line, character } =
    ctx.sourceFile.getLineAndCharacterOfPosition(start);
  ctx.report({
    filePath: ctx.filePath,
    message,
    help,
    line: line + 1,
    column: character + 1,
  });
}

export const rule = defineRule(
  {
    id: "no-wrapper-object-types",
    severity: "warning",
    category: "Type Safety",
    tier: "SYN",
    fixKind: "manual",
    tags: ["ts-idiom"],
    recommendation:
      "Don't use boxed/broad wrapper types (`String`/`Boolean`/`Number`/`Symbol`/`BigInt`/`Object`/`Function`/`{}`) — use the lowercase primitive (`string`, …), `object`/`Record`/`unknown`, or a precise function signature. Never construct wrappers with `new String(...)`; the result is an object, not a primitive.",
  },
  () => ({
    // Banned TYPE references: `let x: Number`, `arr: Object[]`, `fn: Function`.
    [ts.SyntaxKind.TypeReference]: (node, ctx) => {
      if (!ts.isTypeReferenceNode(node)) return;
      if (!ts.isIdentifier(node.typeName)) return;
      // Only a bare reference with no type arguments — leave generics alone.
      if (node.typeArguments !== undefined && node.typeArguments.length > 0) return;
      const name = node.typeName.text;
      if (!BANNED_TYPE_NAMES.has(name)) return;

      const lower = LOWERCASE[name];
      const help =
        lower !== undefined
          ? `Use the lowercase primitive \`${lower}\` instead of the boxed wrapper type \`${name}\`.`
          : name === "Function"
            ? "Use a precise call signature (e.g. `(arg: T) => R`) instead of the unsafe `Function` type."
            : "Use `object`, `Record<string, unknown>`, or `unknown` instead of `Object` — it accepts almost anything.";
      report(node, ctx, `Avoid the wrapper type \`${name}\`.`, help);
    },
    // The empty object type `{}` accepts any non-nullish value — type erasure.
    [ts.SyntaxKind.TypeLiteral]: (node, ctx) => {
      if (!ts.isTypeLiteralNode(node)) return;
      if (node.members.length !== 0) return;
      report(
        node,
        ctx,
        "Avoid the `{}` type; it accepts almost any value.",
        "Use `object`, `Record<string, unknown>`, or `unknown` to express intent precisely.",
      );
    },
    // Wrapper-object construction: `new String('x')`, `new Number(1)`.
    [ts.SyntaxKind.NewExpression]: (node, ctx) => {
      if (!ts.isNewExpression(node)) return;
      if (!ts.isIdentifier(node.expression)) return;
      const name = node.expression.text;
      if (!BANNED_CTOR_NAMES.has(name)) return;
      report(
        node,
        ctx,
        `Do not instantiate the wrapper class \`new ${name}(...)\`.`,
        `\`new ${name}(...)\` produces an object (typeof "object"), not a primitive. Call \`${name}(...)\` without \`new\` to coerce, or use a literal.`,
      );
    },
  }),
);
