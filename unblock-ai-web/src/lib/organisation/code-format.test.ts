import { describe, expect, it } from "vitest";
import {
  isValidDesignationCode,
  isValidOrganisationalUnitCode,
  normalizeOrganisationalUnitCode,
  suggestDesignationCode,
} from "./code-format";

describe("organisational unit codes", () => {
  it("normalises and validates like the API", () => {
    expect(normalizeOrganisationalUnitCode(" foe-ugsd ")).toBe("FOE-UGSD");
    expect(isValidOrganisationalUnitCode("FOE-UGSD")).toBe(true);
    expect(isValidOrganisationalUnitCode("FOE_UGSD")).toBe(false);
    expect(isValidOrganisationalUnitCode("A".repeat(25))).toBe(false);
  });
});

describe("designation codes", () => {
  it("validates like the API and suggests a code from a title", () => {
    expect(isValidDesignationCode("head_of_department")).toBe(true);
    expect(isValidDesignationCode("Head-of-Department")).toBe(false);
    expect(suggestDesignationCode("Senior Lecturer (Grade I)")).toBe("senior_lecturer_grade_i");
    expect(suggestDesignationCode("  Vice-Chancellor  ")).toBe("vice_chancellor");
  });
});
