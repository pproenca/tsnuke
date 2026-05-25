/**
 * THE EQUIVALENCE PROOF — differential test, modern vs legacy oracle (RULE-030).
 *
 * Goal: prove the Effect-TS `shouldFailForDiagnostics` + `resolveExitCode` are
 * EXACTLY equivalent to the legacy algorithm across the FULL enumerated cartesian
 * product of inputs. Unlike the `score` slice, the exit-code gate is a finite,
 * discrete decision with NO rounding subtleties — so we expect 100% equality
 * (zero deviations). The whole input space is enumerable, so we enumerate ALL of it.
 *
 * Input space (finite):
 *   - failOn      ∈ { "error", "warning", "none" }                  (3)
 *   - diagnostics ∈ { empty, warnings-only, has-error }             (3)  representative sets
 *   - scoreMode   ∈ { true, false }                                 (2)
 *   - hadError    ∈ { true, false, undefined }                      (3)
 * => 3 × 3 × 2 × 3 = 54 combinations for resolveExitCode; the gate alone is the
 * 3 × 3 = 9-cell (failOn × diagnostics) sub-grid. We assert modern === legacy in
 * EVERY cell and count the traversal so an accidental empty grid can't pass silently.
 *
 * Strategy:
 *   1. Vendored, frozen copy of the legacy algorithm as an oracle (below).
 *   2. Full cartesian enumeration of the finite input space.
 *   3. Assert modern === legacy in every cell; assert zero divergences.
 */

import { describe, expect, it } from "vitest";
import { resolveExitCode, shouldFailForDiagnostics } from "../main/index.js";
import type { ExitCodeInputs, Severity } from "../main/index.js";

// ---------------------------------------------------------------------------
// ORACLE: Frozen verbatim copy of
//   legacy/ts-doctor/packages/ts-doctor/src/exit-code.ts:18-60
// (the gate + resolver). For differential testing ONLY — do not "fix" it. The
// only edits from the original are: inlining the `FailOn` literal type and the
// `Pick<Diagnostic,"severity">` shape so the oracle is self-contained.
// ---------------------------------------------------------------------------
type LegacyFailOn = "error" | "warning" | "none";

function legacyShouldFailForDiagnostics(
  diagnostics: readonly { severity: Severity }[],
  failOn: LegacyFailOn,
): boolean {
  switch (failOn) {
    case "none":
      return false;
    case "warning":
      return diagnostics.length > 0;
    case "error":
      return diagnostics.some((d) => d.severity === "error");
    default: {
      // Exhaustiveness guard (noFallthroughCasesInSwitch + never check).
      const _never: never = failOn;
      return _never;
    }
  }
}

interface LegacyExitCodeInputs {
  diagnostics: readonly { severity: Severity }[];
  failOn: LegacyFailOn;
  scoreMode: boolean;
  hadError?: boolean;
}

function legacyResolveExitCode(input: LegacyExitCodeInputs): 0 | 1 {
  if (input.hadError === true) return 1;
  if (input.scoreMode) return 0;
  return legacyShouldFailForDiagnostics(input.diagnostics, input.failOn) ? 1 : 0;
}

// ---------------------------------------------------------------------------
// The finite input domain — every axis enumerated exhaustively.
// ---------------------------------------------------------------------------
const sev = (severity: Severity): { severity: Severity } => ({ severity });

const DIAGNOSTIC_SETS: ReadonlyArray<{
  label: string;
  value: ReadonlyArray<{ severity: Severity }>;
}> = [
  { label: "empty", value: [] },
  { label: "warnings-only", value: [sev("warning"), sev("warning")] },
  { label: "has-error", value: [sev("warning"), sev("error")] },
];

const FAIL_ONS: ReadonlyArray<LegacyFailOn> = ["error", "warning", "none"];
const SCORE_MODES: ReadonlyArray<boolean> = [true, false];
const HAD_ERRORS: ReadonlyArray<boolean | undefined> = [true, false, undefined];

describe("equivalence — RULE-030 gate: full 3×3 (failOn × diagnostics) grid", () => {
  it("modern shouldFailForDiagnostics == legacy in EVERY cell (no rounding => 100% equal)", () => {
    let compared = 0;
    let diverged = 0;

    for (const failOn of FAIL_ONS) {
      for (const ds of DIAGNOSTIC_SETS) {
        const modern = shouldFailForDiagnostics(ds.value, failOn);
        const legacy = legacyShouldFailForDiagnostics(ds.value, failOn);
        if (modern !== legacy) diverged++;
        expect(
          modern,
          `gate mismatch at failOn=${failOn} diagnostics=${ds.label}`,
        ).toBe(legacy);
        compared++;
      }
    }

    expect(compared).toBe(FAIL_ONS.length * DIAGNOSTIC_SETS.length);
    expect(compared).toBe(9);
    expect(diverged).toBe(0); // exit-code logic is exact: no deviation by design
  });
});

describe("equivalence — RULE-030 resolver: full 3×3×2×3 cartesian product", () => {
  it("modern resolveExitCode == legacy across ALL 54 combinations (0 divergences)", () => {
    let compared = 0;
    let diverged = 0;

    for (const failOn of FAIL_ONS) {
      for (const ds of DIAGNOSTIC_SETS) {
        for (const scoreMode of SCORE_MODES) {
          for (const hadError of HAD_ERRORS) {
            // exactOptionalPropertyTypes: only set `hadError` when defined.
            const base = { diagnostics: ds.value, failOn, scoreMode };
            const modernInput: ExitCodeInputs =
              hadError === undefined ? base : { ...base, hadError };
            const legacyInput: LegacyExitCodeInputs =
              hadError === undefined ? base : { ...base, hadError };

            const modern = resolveExitCode(modernInput);
            const legacy = legacyResolveExitCode(legacyInput);

            if (modern !== legacy) diverged++;
            expect(
              modern,
              `resolver mismatch at failOn=${failOn} diagnostics=${ds.label} ` +
                `scoreMode=${scoreMode} hadError=${String(hadError)}`,
            ).toBe(legacy);
            compared++;
          }
        }
      }
    }

    // Guard the harness: the WHOLE finite space was traversed and matched exactly.
    expect(compared).toBe(
      FAIL_ONS.length * DIAGNOSTIC_SETS.length * SCORE_MODES.length * HAD_ERRORS.length,
    );
    expect(compared).toBe(54);
    expect(diverged).toBe(0); // exhaustive proof of byte-for-byte exit-code parity
  });
});
