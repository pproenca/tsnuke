import ts from "typescript";
import { defineRule } from "@ts-doctor/rules-core-effect";
import type { RuleContext } from "@ts-doctor/rules-core-effect";

/**
 * SYN — flag the untyped object bag: `Record<string, unknown>` /
 * `Record<string, any>` / `{ [k: string]: unknown }`. These push the object's
 * *shape* out of the type system — every property access returns `unknown`/`any`,
 * so the caller must re-assert or coerce. Define an interface with named
 * properties and let the compiler check access instead. (A hallmark of
 * LLM-generated "args bags" / "payload bags".)
 */

function isStringKey(t: ts.TypeNode): boolean {
  if (t.kind === ts.SyntaxKind.StringKeyword) return true;
  return (
    ts.isTypeReferenceNode(t) &&
    ts.isIdentifier(t.typeName) &&
    t.typeName.text === "PropertyKey"
  );
}

function isUnknownOrAny(t: ts.TypeNode): boolean {
  return t.kind === ts.SyntaxKind.UnknownKeyword || t.kind === ts.SyntaxKind.AnyKeyword;
}

export const rule = defineRule(
  {
    id: "no-record-string-unknown",
    severity: "warning",
    category: "Type Safety",
    tier: "SYN",
    fixKind: "manual",
    tags: ["ts-idiom"],
    recommendation:
      "Replace the `Record<string, unknown>` / index-signature bag with an interface that names the actual properties. An untyped bag forces every access to return `unknown` and be re-asserted at the call site.",
  },
  () => {
    const report = (node: ts.Node, ctx: RuleContext): void => {
      const start = node.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message:
          "Untyped object bag — define an interface with named properties instead of `Record<string, unknown>`/index signature.",
        help: "A named interface gives type-checked access; a string→unknown bag delegates the shape to runtime.",
        line: line + 1,
        column: character + 1,
      });
    };
    return {
      // Record<string, unknown> / Record<PropertyKey, any> / ...
      [ts.SyntaxKind.TypeReference]: (node, ctx) => {
        if (!ts.isTypeReferenceNode(node)) return;
        if (!ts.isIdentifier(node.typeName) || node.typeName.text !== "Record") return;
        const args = node.typeArguments;
        if (args === undefined || args.length !== 2) return;
        const key = args[0];
        const value = args[1];
        if (key !== undefined && value !== undefined && isStringKey(key) && isUnknownOrAny(value)) {
          report(node, ctx);
        }
      },
      // { [k: string]: unknown } — an index-signature-only object type.
      [ts.SyntaxKind.TypeLiteral]: (node, ctx) => {
        if (!ts.isTypeLiteralNode(node)) return;
        if (node.members.length !== 1) return;
        const member = node.members[0];
        if (
          member !== undefined &&
          ts.isIndexSignatureDeclaration(member) &&
          isUnknownOrAny(member.type)
        ) {
          report(node, ctx);
        }
      },
      // interface X extends Record<string, unknown> { ... }
      [ts.SyntaxKind.ExpressionWithTypeArguments]: (node, ctx) => {
        if (!ts.isExpressionWithTypeArguments(node)) return;
        if (!ts.isIdentifier(node.expression) || node.expression.text !== "Record") return;
        const args = node.typeArguments;
        if (args === undefined || args.length !== 2) return;
        const key = args[0];
        const value = args[1];
        if (key !== undefined && value !== undefined && isStringKey(key) && isUnknownOrAny(value)) {
          report(node, ctx);
        }
      },
    };
  },
);
