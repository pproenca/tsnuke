import { describe, expect, it } from "vitest";
import { runRule } from "@ts-fix/rules-core-effect";
import { rule } from "../main/pascal-case-types.js";

// Ported VERBATIM from legacy `.../naming-idioms/pascal-case-types.test.ts`.
describe("pascal-case-types (SYN)", () => {
  it("flags non-PascalCase interface / class / type / enum names", () => {
    expect(runRule(rule, "interface userProfile {}\n")).toHaveLength(1);
    expect(runRule(rule, "class fooBar {}\n")).toHaveLength(1);
    expect(runRule(rule, "type myType = string;\n")).toHaveLength(1);
    expect(runRule(rule, "enum color { Red }\n")).toHaveLength(1);
  });

  it("does NOT flag PascalCase names", () => {
    const code =
      "interface UserProfile {}\nclass DatabaseConnection {}\n" +
      "type ResponseStatus = string;\nenum HttpStatusCode {}\n";
    expect(runRule(rule, code)).toHaveLength(0);
  });

  // Edge: per-kind message label carries the right declaration kind.
  it("labels the declaration kind in the message", () => {
    expect(runRule(rule, "interface userProfile {}\n")[0]!.message).toContain(
      "Interface",
    );
    expect(runRule(rule, "class fooBar {}\n")[0]!.message).toContain("Class");
    expect(runRule(rule, "type myType = string;\n")[0]!.message).toContain("Type");
    expect(runRule(rule, "enum color { Red }\n")[0]!.message).toContain("Enum");
  });
});
