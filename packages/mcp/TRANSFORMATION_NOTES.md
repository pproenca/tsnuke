# `@ts-doctor/mcp-effect` — Transformation Notes

Effect-TS strangler-fig slice for ts-doctor's **MCP (Model Context Protocol) server** —
the stdio adapter that exposes the linter to coding agents (the primary consumer, per the
AI-native design). It wires the finished **engine** + **format** + **rules-registry**
slices behind three tools. The pure handlers are a **faithful behavioral port** of the
legacy `tools.ts`; the SDK wiring (`server.ts`) is reproduced with **one deliberate
deviation**: tool-argument validation moves from **zod → `effect/Schema`** (RULE-029).

## Scope / mapping

| Legacy source | Symbols | Target file |
|---|---|---|
| `legacy/.../packages/mcp/src/tools.ts` (80 lines) | `diagnoseTool`, `explainTool`, `listRulesTool`, `buildLookup`, `DiagnoseToolArgs`, `DiagnoseToolResult`, `ExplainToolArgs`, `RuleCatalogEntry` | `src/main/tools.ts` |
| `legacy/.../packages/mcp/src/server.ts` (63 lines) | `McpServer` stdio wiring + the 3 `server.tool(...)` registrations (zod shapes) | `src/main/server.ts` |
| — (NEW) the zod shapes, re-expressed | `DiagnoseArgs`/`ExplainArgs`/`ListRulesArgs` (`Schema.Struct`), `decode*` (`Schema.decodeUnknownEither`), `*JsonSchema` (`JSONSchema.make`) | `src/main/schemas.ts` |
| — | public barrel | `src/main/index.ts` |

Public barrel: the 3 pure handlers + their arg/result types; the RULE-029 Schemas +
`decode*` + derived JSON Schemas; `createServer` / `main` (the SDK wiring).

## What the 3 tools do (behavior preserved VERBATIM)

- **`ts_doctor_diagnose({ directory, deep? })`** → runs the engine and projects the
  agent-tuned summary + report. Rewired: legacy `diagnose()` (`@ts-doctor/core`) →
  `diagnoseNode(directory, { deep })` (`@ts-doctor/engine-effect`, the prod runnable that
  provides `NodeContext` + bounds the `ts.Program` `Scope`). The report is built with
  `formatAgentReport(diagnostics, score, project.rootDirectory)` (`@ts-doctor/format-effect`),
  and the one-line `summary` string is assembled byte-for-byte as legacy
  (`Score <n>/100[ (partial …)] — <r> rule(s) fired across <o> occurrence(s) in <dir>.`).
  Returns `{ summary, report, scorePartial }`. Stays a `Promise` (it runs the engine).
- **`ts_doctor_explain({ rule })`** → `explain(rule, buildLookup())`
  (`@ts-doctor/format-effect`). `buildLookup` is `asRuleLookup` over a `Record<id, RuleMeta>`
  built from the **rules-registry** catalog (`[...ruleRegistry, ...graphRuleRegistry]`). An
  unknown rule id is handled **inside `explain`** (returns `Unknown rule "…"`), NOT a thrown
  gate — exactly as legacy (and as RULE-029's edge-case note requires). Pure.
- **`ts_doctor_list_rules()`** → the catalog projection from the registry:
  `[...ruleRegistry, ...graphRuleRegistry].map({ id, category, tier, severity }).sort(by id)`.
  Pure.

## Business rule covered

- **RULE-029 — MCP tool input validation.** The 3 tools' arg contracts are enforced
  **before dispatch**: `ts_doctor_diagnose` requires `directory: string` + optional
  `deep: boolean`; `ts_doctor_explain` requires `rule: string`; `ts_doctor_list_rules`
  takes `{}`. Legacy enforced this with **zod raw shapes** handed to the SDK's
  `server.tool(name, desc, shape, handler)`. This slice enforces it with **`effect/Schema`**
  (see Deviation 1). The handlers in `tools.ts` continue to assume already-validated args
  (the legacy invariant), so the authoritative gate lives entirely in `server.ts`/`schemas.ts`.

## Deviations from legacy

### 1. zod → `effect/Schema` for tool-argument validation (RULE-029) — the single library per the brief

The ONE substantive deviation. zod is **GONE** — not imported in any source file, not a
direct dependency, not hoisted to top-level `node_modules` (it survives only as a transitive
peer **of the MCP SDK itself**, which is unavoidable and never touched by our code).

- **The Schemas** (`schemas.ts`): one `Schema.Struct` per tool —
  `DiagnoseArgs = { directory: Schema.String, deep: Schema.optional(Schema.Boolean) }`,
  `ExplainArgs = { rule: Schema.String }`, `ListRulesArgs = {}`.
- **The authoritative gate**: `decodeDiagnoseArgs` / `decodeExplainArgs` /
  `decodeListRulesArgs` are `Schema.decodeUnknownEither(...)`. The `tools/call` handler runs
  the matching decoder on the **raw** incoming `arguments`; on a `Left` it throws an MCP
  `InvalidParams` error (rendered via `ParseResult.TreeFormatter.formatErrorSync`) — the
  faithful equivalent of the SDK's zod gate. On a `Right` it dispatches to the pure handler.
- **The bridge to the SDK** (brief option **b**): the SDK's `McpServer.tool()` *requires* a
  **zod** raw shape for `inputSchema` (`isZodRawShapeCompat`), which would re-introduce zod.
  We therefore do **not** call `tool()`. We construct the `McpServer` (as the brief requires)
  and register the raw `tools/list` + `tools/call` protocol handlers on its underlying
  low-level `server` (`server.server.setRequestHandler(...)`), after declaring the `tools`
  capability (`registerCapabilities({ tools: {} })` — `tool()` would have done this
  implicitly). This routes the raw `arguments` straight through our `effect/Schema` decode.
- **Discovery metadata**: the `tools/list` response advertises a JSON Schema **derived from
  the same `effect/Schema`** via `JSONSchema.make` (`DiagnoseJsonSchema` etc.) so an agent
  sees the parameter contract. This is advisory; the Schema decode is the gate.

`effect/Schema`'s **empty `Struct({})`** is a "non-nullish record" check: `{}` and even a
bare primitive (`7`) decode as `Right` (no required keys to fail), while `null`/`undefined`
are `Left`. The meaningful RULE-029 invariant for the no-param tool — an absent payload is
rejected, an empty/extra-keys object is accepted — holds; the `server.ts` handler also
coalesces a missing payload to `{}` (matching the legacy zod-`{}` "ignore unknown keys"
behavior).

### 2. Handlers consume the modern slices (plumbing, not behavior)

- `diagnose` → `diagnoseNode` (engine-effect prod runnable). Modern `DiagnoseResult.score`
  is `ScoreResult | null` (`{ score, label, partial } | null`), structurally assignable to
  `formatAgentReport`'s `AgentScoreInput | null`; `result.scorePartial` is read directly.
- `formatAgentReport` / `explain` / `asRuleLookup` from **format-effect**.
- `ruleRegistry` / `graphRuleRegistry` from **rules-registry-effect**. Each entry is a
  `Rule`/`GraphRule`, i.e. a **`RuleMeta` superset** (`RuleMeta & { create | analyze }`), so
  `buildLookup` and the catalog projection read the same `id`/`category`/`tier`/`severity`/
  `recommendation`/`fixKind` fields as the legacy `RuleMeta[]`.
- `RuleMeta` (the type) is imported from **contracts-effect** (the canonical de-vendored
  Schema type) instead of legacy `@ts-doctor/rules`.

### 3. SDK version + entry shape

- `@modelcontextprotocol/sdk` pinned to a current version (`^1.29.0`, resolved via
  `npm view`). The legacy import paths are unchanged
  (`.../server/mcp.js`, `.../server/stdio.js`); `.../types.js` is added for the raw protocol
  request schemas + `McpError`/`ErrorCode`.
- The top-level `await server.connect(transport)` is wrapped in `main()` and guarded by an
  `import.meta.url === file://${process.argv[1]}` check so importing the module (tests) does
  not start a transport. `createServer()` is exported for testability.

## What was NOT migrated

- **No re-implementation of analysis logic.** Diagnose/score/format/explain/registry are
  consumed from the proven engine/format/registry slices, never reimplemented here.
- **No CLI.** The CLI (`render`, exit-code, `--fail-on`, RULE-030) is a separate surface;
  this slice is the MCP adapter only.
- **No zod compatibility shim.** zod is removed outright, not bridged.
- **The legacy `legacy/` tree and all consumed slices were left untouched** (read-only).

## Tests (26, all green) + checks

- `src/test/tools.test.ts` (8) — the pure handlers against the REAL slices.
  `diagnoseTool` runs `diagnoseNode` over real temp projects on disk (clean → score 100,
  0 rules, exact summary string; dirty → `no-explicit-any` fires + score < 100; `deep`
  forwarded). `explainTool` → offline text for a known rule, deterministic, unknown rule
  handled inside `explain`. `listRulesTool` → full catalog (count == both registries,
  id-sorted, projected shape; includes per-file + GRAPH rules).
- `src/test/schemas.test.ts` (16) — **RULE-029**: each tool's `decode*` ACCEPTS valid args
  (asserts `Right`) and REJECTS invalid (missing `directory`; non-string `rule`; wrong
  types; nullish payload — asserts `Left`). The derived JSON Schemas carry the right
  `required` fields. A source scan asserts **no `from "zod"` / `require('zod')`** anywhere
  under `src/main`.
- `src/test/server.test.ts` (2) — SDK wiring smoke: `createServer()` builds the `McpServer`
  (no throw) and registers the raw protocol handlers; the SDK's zod-shape `tool()` registry
  is **empty** (we never used the zod path). *(This test caught a real bug: registering raw
  `tools/list`/`tools/call` handlers requires declaring the `tools` capability first —
  fixed by `registerCapabilities({ tools: {} })`.)*
- `vitest.config.ts` inlines the full transitive `.ts`-entry closure (engine's ~12 slices +
  the 13 rule slices the registry aggregates + format + contracts) so esbuild compiles the
  `file:`-linked `.ts` sources at test time.
- **`tsc --noEmit`**: green. **`vitest run`**: 26/26 green.

## Follow-ups

- **Streaming progress notifications.** The brief mentions the diagnose tool could emit MCP
  progress notifications during a long run (the SDK supports `notifications/progress`). Not
  wired — `diagnoseTool` resolves a single `DiagnoseResult`. A future iteration could thread
  a progress callback from `diagnoseNode` through the `tools/call` handler's `extra.sendNotification`.
- **The diagnose tool's agent report reuses the format slice.** The report payload is
  `formatAgentReport`'s `AgentReport` JSON-stringified into the MCP `text` content (as legacy
  did). If a future MCP client prefers `structuredContent`, the report shape is already a
  plain JSON object ready to attach (would also let us declare an `outputSchema`).
- **End-to-end transport test.** The current server test is a wiring smoke (handler
  registration). A full round-trip via an in-memory transport + paired `Client` would assert
  the `content` text shape and the `InvalidParams` error path through the real protocol.
- **De-vendor opportunity already taken**: this slice imports `RuleMeta` from contracts-effect
  rather than re-vendoring it (consistent with the engine/format slices).

---

## Architecture review (consolidated, `architecture-critic`)

Reviewed alongside the CLI slice. **No findings.** The critic confirmed: the zod→`effect/Schema`
swap (RULE-029) is COMPLETE + AUTHORITATIVE — `Schema.decodeUnknownEither` is the real arg gate
for all 3 tools (accepts valid / rejects invalid → MCP `InvalidParams`), and **zod is gone** (not a
direct dep, not imported in `src/`; it survives only as a transitive peer of the MCP SDK, which the
brief permits). Registering raw `tools/list`/`tools/call` handlers (to avoid the SDK's zod `tool()`)
is sound — the `tools` capability is declared, JSON Schemas are derived via `JSONSchema.make`. The 3
handlers are faithful behavioral ports consuming the proven engine/format/registry slices (the
unknown-rule-handled-INSIDE-`explain` legacy invariant is preserved). `VERSION` correctly kept "0.0.0"
(the CLI slice's H1 was aligned to match this).
