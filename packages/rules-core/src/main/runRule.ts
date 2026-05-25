/**
 * The AST rule drivers — port of legacy `ts-fix-rules/src/test-utils.ts`.
 *
 *  - {@link runRule}: Tier-1 (SYN) — parse a snippet, walk, dispatch by `SyntaxKind`.
 *  - {@link runTypeAwareRule}: Tier-2 (TYP) — build a one-file `ts.Program` (real default
 *    lib so the checker resolves `Promise`, unions, etc.) and run visitors WITH a live
 *    `ts.TypeChecker`.
 *
 * Both mirror what the core engine does (one parse/walk/dispatch; the TYP path additionally
 * carries the checker). Plain TS over the TS compiler API — NOT `Effect`-wrapped
 * (synchronous AST traversal). Owned here so the rule-category slices and the engine share
 * ONE pair of drivers rather than vendoring a copy each.
 */

import { resolve } from "node:path";
import ts from "typescript";
import type { Diagnostic } from "@ts-fix/contracts-effect";
import { createGraphRuleContext, createRuleContext } from "./defineRule.js";
import type { GraphRule, Rule } from "./defineRule.js";
import type { ModuleGraph } from "./ModuleGraph.js";

/**
 * Parse `code`, run `rule`'s visitors over the resulting AST, and return the
 * diagnostics it reports. `filePath` is the synthetic path the diagnostics carry.
 *
 * Fires a `SourceFile`-keyed visitor once for the file (comment/whole-file rules),
 * then walks every node dispatching the visitor registered for its `SyntaxKind`.
 */
export function runRule(rule: Rule, code: string, filePath = "test.ts"): Diagnostic[] {
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
 * Tier-2 (TYP) driver: build a one-file `ts.Program` over an in-memory snippet (real
 * default lib, so the checker can resolve `Promise`, unions, etc.), then run the rule's
 * visitors WITH a live `ts.TypeChecker`. Mirrors what core's engine does on the
 * `typecheck:ok` path. Port of legacy `test-utils.ts` `runTypeAwareRule`.
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

/**
 * GRAPH-tier driver: run a {@link GraphRule}'s whole-graph `analyze` pass over a
 * {@link ModuleGraph} and collect the diagnostics it emits. GRAPH rules reason about the
 * cross-file module graph (cycles, unused exports), not a single file's AST — so there is
 * no parse/walk; the rule receives the graph and a report sink. Mirrors what the core
 * engine does on the GRAPH path.
 */
export function runGraphRule(rule: GraphRule, graph: ModuleGraph): Diagnostic[] {
  const collected: Diagnostic[] = [];
  const ctx = createGraphRuleContext(rule, { graph, sink: (d) => collected.push(d) });
  rule.analyze(ctx);
  return collected;
}
