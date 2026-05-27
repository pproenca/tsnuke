/**
 * Pin `playbook.const.ts` to `prompts/agent.md` (the source-of-truth playbook).
 *
 * The constant exists because vitest source-mode can't natively `import "*.md"`
 * and the format package has no codegen step. This test catches the drift the
 * setup invites: if the markdown is updated without re-syncing the constant, the
 * CLI bundle would ship a stale playbook. If you see this fail, copy the latest
 * `prompts/agent.md` content into the template literal in `playbook.const.ts`
 * (preserving the escaping for backticks / `${` interpolation markers).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLAYBOOK_MARKDOWN } from "../main/playbook.const.js";

// Resolve `prompts/agent.md` at the repo root from this test file's location.
// `packages/format/src/test/playbook.sync.test.ts` → 4 segments up to the repo root
// (test → src → format → packages → tsnuke).
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..", "..");
const playbookPath = join(repoRoot, "prompts", "agent.md");

describe("playbook.const.ts mirrors prompts/agent.md", () => {
  it("is byte-identical to the source-of-truth markdown", () => {
    const source = readFileSync(playbookPath, "utf8");
    // The TS constant uses template-literal escaping (`\`` and `\${`), the .md
    // file is raw markdown. Normalise the constant back to raw form to compare.
    const constant = PLAYBOOK_MARKDOWN;
    expect(constant).toBe(source);
  });
});
