/**
 * Module-graph builder for the GRAPH tier (§4.1).
 *
 * Parses each file's import/export/dynamic-import specifiers and resolves the
 * RELATIVE ones against the in-project file set, producing a {@link ModuleGraph}:
 *   - `imports`     — resolved edges (for cycle/layering rules, e.g. RULE-015)
 *   - `exports`     — names each file exports (for unused-export analysis)
 *   - `usedExports` — names other files import from each file
 *   - `wildcardUsed`— files whose exports are namespace/wildcard/dynamic-used
 *
 * Bare (package) imports are intentionally ignored — GRAPH rules reason about the
 * project's own module structure. Structural only: no `ts.Program` / checker.
 *
 * PURE & SYNCHRONOUS — NOT `Effect`-wrapped. It does NO I/O: the caller (the engine)
 * collects the in-project source files, reads their text (a `FileSystem` concern that
 * belongs to the engine, not here), and hands them in as {@link GraphFileInput}[].
 * This builder only parses already-in-memory text + resolves paths against the input
 * set. Faithful port of legacy `packages/core/src/module-graph.ts:buildModuleGraph`.
 */

import { dirname, resolve } from "node:path";
import ts from "typescript";
// The `ModuleGraph` TYPE is OWNED by the rules domain (`@tsnuke/rules-core-effect`).
// `import type` is erased at runtime under `verbatimModuleSyntax`, so this introduces no
// runtime dependency on rules-core — only a compile-time type link.
import type { ModuleGraph } from "@tsnuke/rules-core-effect";

/** A file to include in the graph: absolute path + contents. */
export interface GraphFileInput {
  filePath: string;
  text: string;
}

/** Candidate on-disk paths a relative specifier could resolve to. */
function candidatesFor(base: string): string[] {
  const list = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.d.ts`,
    `${base}.js`,
    `${base}.jsx`,
    resolve(base, "index.ts"),
    resolve(base, "index.tsx"),
  ];
  // ESM TypeScript: a `.js`/`.jsx`/`.mjs`/`.cjs` specifier maps to its `.ts`/
  // `.tsx` source (the runtime extension, source extension differ). Swap it.
  const ext = base.match(/\.(js|jsx|mjs|cjs)$/);
  if (ext !== null) {
    const stem = base.slice(0, base.length - ext[0].length);
    list.push(`${stem}.ts`, `${stem}.tsx`, `${stem}.d.ts`);
  }
  return list;
}

/** Exported names declared on a node via an `export` modifier, if any. */
function exportedNamesOfStatement(node: ts.Node): string[] {
  const hasExport =
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false);
  if (!hasExport) return [];
  const isDefault =
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false);
  if (isDefault) return ["default"];

  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isEnumDeclaration(node) ||
      ts.isModuleDeclaration(node)) &&
    node.name !== undefined &&
    ts.isIdentifier(node.name)
  ) {
    return [node.name.text];
  }
  if (ts.isTypeAliasDeclaration(node)) return [node.name.text];
  if (ts.isVariableStatement(node)) {
    const names: string[] = [];
    for (const decl of node.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) names.push(decl.name.text);
    }
    return names;
  }
  return [];
}

/** Build the resolved-edge module graph over `files`. */
export function buildModuleGraph(files: readonly GraphFileInput[]): ModuleGraph {
  // normalized absolute path → original filePath (edges use the original).
  const known = new Map<string, string>();
  for (const f of files) known.set(resolve(f.filePath), f.filePath);

  const imports = new Map<string, readonly string[]>();
  const exports = new Map<string, readonly string[]>();
  const usedExports = new Map<string, Set<string>>();
  const wildcardUsed = new Set<string>();

  const markUsed = (target: string, name: string): void => {
    let set = usedExports.get(target);
    if (set === undefined) {
      set = new Set<string>();
      usedExports.set(target, set);
    }
    set.add(name);
  };

  for (const f of files) {
    const sourceFile = ts.createSourceFile(
      f.filePath,
      f.text,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ false,
      f.filePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const dir = dirname(f.filePath);
    const edges: string[] = [];
    const exportNames: string[] = [];

    const resolveSpecifier = (spec: string): string | undefined => {
      if (!spec.startsWith(".")) return undefined; // only in-project relative.
      const base = resolve(dir, spec);
      for (const candidate of candidatesFor(base)) {
        const target = known.get(resolve(candidate));
        if (target !== undefined && target !== f.filePath) return target;
      }
      return undefined;
    };
    const addEdge = (target: string): void => {
      if (!edges.includes(target)) edges.push(target);
    };

    const visit = (node: ts.Node): void => {
      // import ... from "x"
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const target = resolveSpecifier(node.moduleSpecifier.text);
        if (target !== undefined) {
          addEdge(target);
          const clause = node.importClause;
          if (clause !== undefined) {
            if (clause.name !== undefined) markUsed(target, "default");
            const named = clause.namedBindings;
            if (named !== undefined) {
              if (ts.isNamespaceImport(named)) {
                wildcardUsed.add(target); // import * as ns
              } else {
                for (const el of named.elements) {
                  markUsed(target, (el.propertyName ?? el.name).text);
                }
              }
            }
          }
        }
      } else if (ts.isExportDeclaration(node)) {
        // export { a, b } [from "x"]  |  export * [as ns] from "x"
        const target =
          node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)
            ? resolveSpecifier(node.moduleSpecifier.text)
            : undefined;
        if (target !== undefined) addEdge(target);
        if (node.exportClause === undefined) {
          // export * from "x"  → all of x's exports are used.
          if (target !== undefined) wildcardUsed.add(target);
        } else if (ts.isNamedExports(node.exportClause)) {
          for (const el of node.exportClause.elements) {
            const local = (el.propertyName ?? el.name).text;
            if (target !== undefined) {
              markUsed(target, local); // re-export USES the name from x …
              exportNames.push(el.name.text); // … and re-exports it under its name.
            } else {
              exportNames.push(el.name.text); // local `export { a }`
            }
          }
        } else if (target !== undefined) {
          // export * as ns from "x"
          wildcardUsed.add(target);
        }
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference) &&
        ts.isStringLiteral(node.moduleReference.expression)
      ) {
        const target = resolveSpecifier(node.moduleReference.expression.text);
        if (target !== undefined) {
          addEdge(target);
          wildcardUsed.add(target); // import x = require("y") — treat as full use.
        }
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length > 0
      ) {
        const arg = node.arguments[0];
        if (arg !== undefined && ts.isStringLiteral(arg)) {
          const target = resolveSpecifier(arg.text);
          if (target !== undefined) {
            addEdge(target);
            wildcardUsed.add(target); // dynamic import — names unknowable.
          }
        }
      } else if (ts.isExportAssignment(node)) {
        exportNames.push("default"); // `export default x` / `export = x`
      } else {
        // exported declarations (export const/function/class/type/...).
        for (const name of exportedNamesOfStatement(node)) exportNames.push(name);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);

    imports.set(f.filePath, edges);
    exports.set(f.filePath, exportNames);
  }

  return {
    files: files.map((f) => f.filePath),
    imports,
    exports,
    usedExports,
    wildcardUsed,
  };
}
