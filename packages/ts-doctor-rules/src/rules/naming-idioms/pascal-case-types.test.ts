import { describe, expect, it } from "vitest";
import { rule } from "./pascal-case-types.js";
import { runRule } from "../../test-utils.js";

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
});
