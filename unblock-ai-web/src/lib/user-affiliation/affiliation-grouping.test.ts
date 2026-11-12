import { describe, expect, it } from "vitest";
import {
  ARCHITECTURE,
  CIVIL,
  COMPUTER_SCIENCE,
  ENGINEERING,
  ENGINEERING_UNDERGRADUATE,
  EXAMINATIONS,
} from "@/lib/testing/organisation-fixture";
import { effectiveFacultyOf } from "@/lib/organisation/organisational-unit-tree";
import { groupByEffectiveFaculty } from "./affiliation-grouping";

describe("effectiveFacultyOf", () => {
  it("is the faculty itself, the parent faculty, or nothing for university-level units", () => {
    expect(effectiveFacultyOf(ENGINEERING)?.id).toBe(ENGINEERING.id);
    expect(effectiveFacultyOf(COMPUTER_SCIENCE)?.id).toBe(ENGINEERING.id);
    expect(effectiveFacultyOf(EXAMINATIONS)).toBeNull();
  });
});

describe("groupByEffectiveFaculty", () => {
  it("groups by faculty name with university-level units last, ordering units by type then name", () => {
    const groups = groupByEffectiveFaculty(
      [EXAMINATIONS, CIVIL, ENGINEERING_UNDERGRADUATE, COMPUTER_SCIENCE, ARCHITECTURE, ENGINEERING],
      (unit) => unit,
    );
    expect(groups.map((group) => [group.faculty?.code ?? null, group.items.map((unit) => unit.code)])).toEqual([
      ["FOA", ["FOA"]],
      ["FOE", ["FOE", "CE", "CSE", "FOE-UGSD"]],
      [null, ["EXAM"]],
    ]);
  });
});
