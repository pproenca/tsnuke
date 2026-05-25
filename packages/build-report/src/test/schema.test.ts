/**
 * The wire-contract proof — RULE-034 (versioned `effect/Schema` report).
 *
 * The Modernization Brief (line 92) explicitly wants `JsonReportV1` and its
 * sub-types modeled as `effect/Schema`. These tests prove the Schema actually
 * MODELS the real `buildReport` output: every report the builder produces must
 * `Schema.encode` (and decode-round-trip) cleanly under the contract. A drift
 * between the builder and the wire schema would surface here.
 */

import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { buildReport, JsonReportV1 } from "../main/index.js";
import type { BuildReportInput, Diagnostic } from "../main/index.js";

function diag(
  over: Partial<Diagnostic> & Pick<Diagnostic, "rule" | "severity" | "filePath">,
): Diagnostic {
  return {
    plugin: "ts-fix",
    message: "m",
    help: "h",
    line: 1,
    column: 1,
    category: "c",
    tier: "SYN",
    ...over,
  } as Diagnostic;
}

const INPUTS: ReadonlyArray<{ name: string; input: BuildReportInput }> = [
  {
    name: "scored multi-project, diff mode",
    input: {
      version: "1.0.0",
      directory: "/repo",
      mode: "diff",
      diff: { baseBranch: "main", currentBranch: "feat", changedFileCount: 2, isCurrentChanges: false },
      projects: [
        {
          directory: "/a",
          diagnostics: [diag({ rule: "no-any", severity: "error", filePath: "/a/x.ts" })],
          score: 90,
          scorePartial: false,
          skippedChecks: [],
          elapsedMilliseconds: 1,
        },
        {
          directory: "/b",
          diagnostics: [],
          score: 40,
          scorePartial: true,
          skippedChecks: ["TYP"],
          elapsedMilliseconds: 2,
        },
      ],
      elapsedMilliseconds: 10,
    },
  },
  {
    name: "unscored + failed run (error, null score/label)",
    input: {
      version: "2.0.0",
      directory: "/repo",
      mode: "full",
      projects: [{ directory: "/a", diagnostics: [], score: null, scorePartial: false, skippedChecks: [], elapsedMilliseconds: 1 }],
      elapsedMilliseconds: 5,
      error: { message: "boom", name: "DiscoveryError", chain: ["fs gone"] },
    },
  },
];

describe("Report schema — RULE-034 (Schema models real builder output)", () => {
  const encode = Schema.encodeSync(JsonReportV1);
  const decode = Schema.decodeUnknownSync(JsonReportV1);

  for (const { name, input } of INPUTS) {
    it(`buildReport output encodes + decode-round-trips: ${name}`, () => {
      const report = buildReport(input);
      const encoded = encode(report);
      // The wire field is `scoreLabel` (not `band`) — assert it survives encoding.
      expect("scoreLabel" in encoded.summary).toBe(true);
      expect(encoded.schemaVersion).toBe(1);
      // Round-trip: decode(encode(x)) is structurally identical.
      expect(decode(encoded)).toStrictEqual(report);
    });
  }
});
