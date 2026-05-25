import ts from "typescript";
import { defineRule } from "@ts-doctor/rules-core-effect";

/**
 * SYN — flag a TypeScript `namespace X {}` / `module X {}` declaration and
 * prefer ES modules.
 *
 * Internal namespaces emit runtime code and predate ES modules. An ambient
 * `declare module "pkg" {}` (a module-augmentation with a string-literal name)
 * is NOT a namespace and is left alone.
 */
export const rule = defineRule(
  {
    id: "no-namespace",
    severity: "warning",
    category: "Naming & Idioms",
    tier: "SYN",
    fixKind: "codemod",
    tags: ["idioms"],
    recommendation:
      "Prefer ES modules (`import`/`export`) over TypeScript namespaces — namespaces emit runtime code and predate the module system.",
  },
  () => ({
    [ts.SyntaxKind.ModuleDeclaration]: (node, ctx) => {
      if (!ts.isModuleDeclaration(node)) return;
      // An identifier name means `namespace X {}` / `module X {}`. A string-literal
      // name (e.g. `declare module "pkg" {}`) is module augmentation — skip it.
      if (!ts.isIdentifier(node.name)) return;
      const start = node.name.getStart(ctx.sourceFile);
      const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(start);
      ctx.report({
        filePath: ctx.filePath,
        message: `Prefer ES modules over TypeScript namespace \`${node.name.text}\`.`,
        help: "Replace the namespace with ES module `import`/`export`; namespaces emit runtime code.",
        line: line + 1,
        column: character + 1,
      });
    },
  }),
);
