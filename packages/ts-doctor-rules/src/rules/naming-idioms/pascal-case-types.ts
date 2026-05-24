import ts from "typescript";
import { defineRule } from "../../define-rule.js";
import type { RuleContext } from "../../define-rule.js";

/**
 * SYN — type-level declaration names (class, interface, type alias, enum) should
 * be PascalCase. (AWS CDK TS best practices: "Use PascalCase for class names and
 * interface names" / "Use PascalCase for type names and enum names".) Consistent
 * casing keeps the type surface readable. Identifier names only — enum *members*
 * are intentionally not constrained (UPPER_CASE members are common).
 */

const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;

export const rule = defineRule(
  {
    id: "pascal-case-types",
    severity: "warning",
    category: "Naming & Idioms",
    tier: "SYN",
    fixKind: "manual",
    tags: ["convention"],
    recommendation:
      "Name classes, interfaces, type aliases, and enums in PascalCase (e.g. `UserProfile`, `ResponseStatus`).",
  },
  () => {
    const check = (name: ts.Identifier, kind: string, ctx: RuleContext): void => {
      if (PASCAL_CASE.test(name.text)) return;
      const start = name.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: `${kind} name \`${name.text}\` should be PascalCase.`,
        help: "Rename to PascalCase (an uppercase first letter, no separators).",
        line: line + 1,
        column: character + 1,
      });
    };
    return {
      [ts.SyntaxKind.ClassDeclaration]: (node, ctx) => {
        if (ts.isClassDeclaration(node) && node.name !== undefined) check(node.name, "Class", ctx);
      },
      [ts.SyntaxKind.InterfaceDeclaration]: (node, ctx) => {
        if (ts.isInterfaceDeclaration(node)) check(node.name, "Interface", ctx);
      },
      [ts.SyntaxKind.TypeAliasDeclaration]: (node, ctx) => {
        if (ts.isTypeAliasDeclaration(node)) check(node.name, "Type", ctx);
      },
      [ts.SyntaxKind.EnumDeclaration]: (node, ctx) => {
        if (ts.isEnumDeclaration(node)) check(node.name, "Enum", ctx);
      },
    };
  },
);
