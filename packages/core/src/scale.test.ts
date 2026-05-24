import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIER2_MEMORY_CEILING_BYTES,
  shouldSkipTier2ForMemory,
  withDisposable,
  withDisposableProgram,
} from "./scale.js";

describe("scale guard (BC-24)", () => {
  it("withDisposableProgram builds, runs fn, then disposes — in order, sequentially", () => {
    const events: string[] = [];
    const result = withDisposableProgram(
      "proj-a",
      (key) => {
        events.push(`build:${key}`);
        return { key };
      },
      (program) => events.push(`dispose:${program.key}`),
      (program) => {
        events.push(`use:${program.key}`);
        return program.key.toUpperCase();
      },
    );
    expect(result).toBe("PROJ-A");
    expect(events).toEqual(["build:proj-a", "use:proj-a", "dispose:proj-a"]);
  });

  it("disposes the Program even when fn throws (memory never lingers)", () => {
    const events: string[] = [];
    expect(() =>
      withDisposableProgram(
        "p",
        () => ({ v: 1 }),
        () => events.push("disposed"),
        () => {
          throw new Error("boom");
        },
      ),
    ).toThrow("boom");
    expect(events).toEqual(["disposed"]);
  });

  it("withDisposable is idempotent — dispose runs cleanup at most once", () => {
    let n = 0;
    const held = withDisposable({}, () => {
      n++;
    });
    held.dispose();
    held.dispose();
    expect(n).toBe(1);
  });

  it("withDisposable installs Symbol.dispose for the `using` keyword", () => {
    const held = withDisposable({}, () => {});
    expect(
      typeof (held as unknown as Record<PropertyKey, unknown>)[
        (Symbol as { dispose?: symbol }).dispose ?? Symbol.for("Symbol.dispose")
      ],
    ).toBe("function");
  });

  it("shouldSkipTier2ForMemory: skip when projected RSS exceeds the ceiling (graceful degrade)", () => {
    const ceiling = 1000;
    expect(shouldSkipTier2ForMemory(900, 200, ceiling)).toBe(true); // 1100 > 1000
    expect(shouldSkipTier2ForMemory(500, 200, ceiling)).toBe(false); // 700 ≤ 1000
  });

  it("has a sane default ceiling", () => {
    expect(DEFAULT_TIER2_MEMORY_CEILING_BYTES).toBeGreaterThan(0);
  });
});
