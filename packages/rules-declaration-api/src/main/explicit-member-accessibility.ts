import ts from "typescript";
import { defineRule } from "@ts-fix/rules-core-effect";
import type { RuleContext } from "@ts-fix/rules-core-effect";

/**
 * SYN — class members should declare an explicit access modifier
 * (`public`/`private`/`protected`). (AWS CDK TS best practices: "Use access
 * modifiers".) Members default to `public`; stating intent makes the class's
 * public surface deliberate rather than accidental.
 */

const ACCESS_MODIFIERS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.PublicKeyword,
  ts.SyntaxKind.PrivateKeyword,
  ts.SyntaxKind.ProtectedKeyword,
]);

export const rule = defineRule(
  {
    id: "explicit-member-accessibility",
    severity: "warning",
    category: "Declaration & API Hygiene",
    tier: "SYN",
    fixKind: "manual",
    tags: ["convention"],
    recommendation:
      "Declare `public`/`private`/`protected` on class members. Implicit `public` makes the class's public surface accidental; explicit modifiers state intent.",
  },
  () => {
    const check = (node: ts.Node, ctx: RuleContext): void => {
      // Only class members (object-literal methods can't take access modifiers).
      const parent = node.parent;
      if (
        parent === undefined ||
        !(ts.isClassDeclaration(parent) || ts.isClassExpression(parent))
      ) {
        return;
      }
      const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
      if (mods?.some((m) => ACCESS_MODIFIERS.has(m.kind)) ?? false) return;

      const named = node as ts.NamedDeclaration;
      const label =
        named.name !== undefined && ts.isIdentifier(named.name)
          ? `\`${named.name.text}\``
          : "member";
      const start = node.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: `Class ${label} has no access modifier; declare \`public\`/\`private\`/\`protected\`.`,
        help: "Add an explicit accessibility modifier so the public surface is intentional.",
        line: line + 1,
        column: character + 1,
      });
    };
    return {
      [ts.SyntaxKind.PropertyDeclaration]: check,
      [ts.SyntaxKind.MethodDeclaration]: check,
      [ts.SyntaxKind.GetAccessor]: check,
      [ts.SyntaxKind.SetAccessor]: check,
    };
  },
);
