import { resolve } from "node:path";
import ts from "typescript";
import { createRuleContext } from "./define-rule.js";
import type { Rule } from "./define-rule.js";
import type { Diagnostic } from "./types.js";

/**
 * Test-only driver: parse a TS snippet, run a rule's visitors over the AST, and
 * collect the diagnostics it emits. Mirrors (in miniature) what the core engine
 * does on the Tier-1 path — one parse, walk, dispatch by `SyntaxKind`.
 *
 * Note: this lives in `src/` (not a `.test.ts`) so it can be imported by tests;
 * it is excluded from the public surface (not re-exported from `index.ts`).
 */
export function runRule(
  rule: Rule,
  code: string,
  filePath = "test.ts",
): Diagnostic[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    code,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

  const collected: Diagnostic[] = [];
  const ctx = createRuleContext(rule, {
    sourceFile,
    filePath,
    sink: (d) => collected.push(d),
  });

  const visitors = rule.create(ctx);

  // SourceFile-keyed visitors fire once for the file itself (comment/text rules).
  const sourceFileVisitor = visitors[ts.SyntaxKind.SourceFile];
  if (sourceFileVisitor) sourceFileVisitor(sourceFile, ctx);

  // Walk every node and dispatch the matching kind visitor.
  const walk = (node: ts.Node): void => {
    if (node.kind !== ts.SyntaxKind.SourceFile) {
      const visitor = visitors[node.kind];
      if (visitor) visitor(node, ctx);
    }
    ts.forEachChild(node, walk);
  };
  walk(sourceFile);

  return collected;
}

/**
 * Test-only driver for **TYP (Tier-2, type-aware) rules**: builds a one-file
 * `ts.Program` over an in-memory snippet (real default lib, so the checker can
 * resolve `Promise`, unions, etc.), then runs the rule's visitors WITH a live
 * `ts.TypeChecker`. Mirrors what core's engine does on the `typecheck:ok` path.
 */
export function runTypeAwareRule(
  rule: Rule,
  code: string,
  filePath = "type-aware-test.ts",
): Diagnostic[] {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  };
  const want = resolve(filePath);
  const host = ts.createCompilerHost(options, /* setParentNodes */ true);

  const origGet = host.getSourceFile.bind(host);
  host.getSourceFile = (name, lvOrOpts, onError, shouldCreate) => {
    if (resolve(name) === want) {
      return ts.createSourceFile(name, code, lvOrOpts, true, ts.ScriptKind.TS);
    }
    return origGet(name, lvOrOpts, onError, shouldCreate);
  };
  const origExists = host.fileExists.bind(host);
  host.fileExists = (name) => resolve(name) === want || origExists(name);
  const origRead = host.readFile.bind(host);
  host.readFile = (name) => (resolve(name) === want ? code : origRead(name));

  const program = ts.createProgram([filePath], options, host);
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(filePath);
  if (sourceFile === undefined) {
    throw new Error(`failed to load source file into program: ${filePath}`);
  }

  const collected: Diagnostic[] = [];
  const ctx = createRuleContext(rule, {
    sourceFile,
    filePath,
    checker,
    sink: (d) => collected.push(d),
  });
  const visitors = rule.create(ctx);

  const sourceFileVisitor = visitors[ts.SyntaxKind.SourceFile];
  if (sourceFileVisitor) sourceFileVisitor(sourceFile, ctx);

  const walk = (node: ts.Node): void => {
    if (node.kind !== ts.SyntaxKind.SourceFile) {
      const visitor = visitors[node.kind];
      if (visitor) visitor(node, ctx);
    }
    ts.forEachChild(node, walk);
  };
  walk(sourceFile);

  return collected;
}
