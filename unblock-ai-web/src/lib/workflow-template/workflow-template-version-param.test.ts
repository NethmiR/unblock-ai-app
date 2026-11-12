import { describe, expect, it } from "vitest";
import { parseWorkflowTemplateVersionParam } from "./workflow-template-version-param";

describe("parseWorkflowTemplateVersionParam", () => {
  it("accepts positive integers", () => {
    expect(parseWorkflowTemplateVersionParam("3")).toBe(3);
    expect(parseWorkflowTemplateVersionParam(["2", "5"])).toBe(2);
  });

  it("ignores anything else", () => {
    for (const raw of [undefined, "", "0", "-1", "1.5", "abc"]) {
      expect(parseWorkflowTemplateVersionParam(raw)).toBeNull();
    }
  });
});
