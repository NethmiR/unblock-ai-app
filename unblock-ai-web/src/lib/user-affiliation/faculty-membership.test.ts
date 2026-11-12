import { describe, expect, it } from "vitest";
import {
  CIVIL,
  COMPUTER_SCIENCE,
  ENGINEERING,
  ENGINEERING_UNDERGRADUATE,
  EXAMINATIONS,
} from "@/lib/testing/organisation-fixture";
import { departmentNamesByRequiredFaculty, requiredFacultyIdOf } from "./faculty-membership";

describe("requiredFacultyIdOf", () => {
  it("is the parent faculty of a department and null for every other unit", () => {
    expect(requiredFacultyIdOf(COMPUTER_SCIENCE)).toBe(ENGINEERING.id);
    expect(requiredFacultyIdOf(ENGINEERING_UNDERGRADUATE)).toBeNull();
    expect(requiredFacultyIdOf(ENGINEERING)).toBeNull();
    expect(requiredFacultyIdOf(EXAMINATIONS)).toBeNull();
  });
});

describe("departmentNamesByRequiredFaculty", () => {
  it("lists each faculty's departments among the given units, ignoring other units", () => {
    const names = departmentNamesByRequiredFaculty([ENGINEERING, COMPUTER_SCIENCE, CIVIL, ENGINEERING_UNDERGRADUATE, EXAMINATIONS]);
    expect([...names.entries()]).toEqual([[ENGINEERING.id, [COMPUTER_SCIENCE.name, CIVIL.name]]]);
  });
});
