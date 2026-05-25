/**
 * THE FROZEN ORACLE — a vendored, byte-for-byte copy of the legacy
 * `legacy/ts-doctor/packages/core/src/module-graph.ts` `buildModuleGraph`
 * (+ its helpers `candidatesFor` / `exportedNamesOfStatement`), used SOLELY as the
 * reference implementation for the differential equivalence proof.
 *
 * There is NO legacy `.test.ts` for this module, so the equivalence proof cannot be
 * "re-run the legacy tests"; instead we pin the modern impl against a frozen snapshot
 * of the legacy algorithm itself. DO NOT edit this to track the modern impl — its whole
 * value is being an independent, frozen reference. The only intentional change from the
 * legacy file is structural: the `ModuleGraph` return type is declared LOCALLY here
 * (`OracleModuleGraph`, identical shape) rather than imported from `@ts-doctor/rules`,
 * so the oracle is self-contained and unaffected by any change to the shared type.
 */

import { dirname, resolve } from "node:path";
import ts from "typescript";

/** Local clone of the legacy `ModuleGraph` shape (the oracle's return type). */
export interface OracleModuleGraph {
  readonly files: readonly string[];
  readonly imports: ReadonlyMap<string, readonly string[]>;
  readonly exports: ReadonlyMap<string, readonly string[]>;
  readonly usedExports: ReadonlyMap<string, ReadonlySet<string>>;
  readonly wildcardUsed: ReadonlySet<string>;
}

/** A file to include in the graph: absolute path + contents. */
export interface OracleGraphFileInput {
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

/** Build the resolved-edge module graph over `files` (frozen legacy algorithm). */
export function buildModuleGraphOracle(
  files: readonly OracleGraphFileInput[],
): OracleModuleGraph {
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
      false,
      f.filePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const dir = dirname(f.filePath);
    const edges: string[] = [];
    const exportNames: string[] = [];

    const resolveSpecifier = (spec: string): string | undefined => {
      if (!spec.startsWith(".")) return undefined;
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
                wildcardUsed.add(target);
              } else {
                for (const el of named.elements) {
                  markUsed(target, (el.propertyName ?? el.name).text);
                }
              }
            }
          }
        }
      } else if (ts.isExportDeclaration(node)) {
        const target =
          node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)
            ? resolveSpecifier(node.moduleSpecifier.text)
            : undefined;
        if (target !== undefined) addEdge(target);
        if (node.exportClause === undefined) {
          if (target !== undefined) wildcardUsed.add(target);
        } else if (ts.isNamedExports(node.exportClause)) {
          for (const el of node.exportClause.elements) {
            const local = (el.propertyName ?? el.name).text;
            if (target !== undefined) {
              markUsed(target, local);
              exportNames.push(el.name.text);
            } else {
              exportNames.push(el.name.text);
            }
          }
        } else if (target !== undefined) {
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
          wildcardUsed.add(target);
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
            wildcardUsed.add(target);
          }
        }
      } else if (ts.isExportAssignment(node)) {
        exportNames.push("default");
      } else {
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
