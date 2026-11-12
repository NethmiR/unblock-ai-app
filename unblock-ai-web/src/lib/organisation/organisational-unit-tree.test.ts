import { describe, expect, it } from "vitest";
import {
  ARCHITECTURE,
  CIVIL,
  COMPUTER_SCIENCE,
  ENGINEERING,
  ENGINEERING_UNDERGRADUATE,
  EXAMINATIONS,
} from "@/lib/testing/organisation-fixture";
import {
  buildFacultyTree,
  formatOrganisationalUnitPath,
  groupDivisionsByScope,
  matchesOrganisationalUnitSearch,
} from "./organisational-unit-tree";

const UNITS = [EXAMINATIONS, COMPUTER_SCIENCE, ENGINEERING_UNDERGRADUATE, ENGINEERING, CIVIL, ARCHITECTURE];

describe("buildFacultyTree", () => {
  it("nests departments and faculty divisions under faculties, sorted by name", () => {
    const tree = buildFacultyTree(UNITS);
    expect(tree.map((node) => node.faculty.code)).toEqual(["FOA", "FOE"]);
    expect(tree[1].departments.map((unit) => unit.code)).toEqual(["CE", "CSE"]);
    expect(tree[1].divisions.map((unit) => unit.code)).toEqual(["FOE-UGSD"]);
    expect(tree[0].departments).toEqual([]);
  });
});

describe("groupDivisionsByScope", () => {
  it("lists university-level divisions first, then each faculty's divisions", () => {
    const groups = groupDivisionsByScope(UNITS);
    expect(groups.map((group) => [group.faculty?.code ?? null, group.divisions.map((unit) => unit.code)])).toEqual([
      [null, ["EXAM"]],
      ["FOE", ["FOE-UGSD"]],
    ]);
  });
});

describe("formatOrganisationalUnitPath", () => {
  it("prefixes the parent name for child units", () => {
    expect(formatOrganisationalUnitPath(COMPUTER_SCIENCE)).toBe("Faculty of Engineering › Department of Computer Science & Engineering");
    expect(formatOrganisationalUnitPath(EXAMINATIONS)).toBe("Examinations & Registration Division");
  });
});

describe("matchesOrganisationalUnitSearch", () => {
  it("matches name or code case-insensitively and treats blank as a match", () => {
    expect(matchesOrganisationalUnitSearch(COMPUTER_SCIENCE, "cse")).toBe(true);
    expect(matchesOrganisationalUnitSearch(COMPUTER_SCIENCE, "computer")).toBe(true);
    expect(matchesOrganisationalUnitSearch(COMPUTER_SCIENCE, "civil")).toBe(false);
    expect(matchesOrganisationalUnitSearch(COMPUTER_SCIENCE, "  ")).toBe(true);
  });
});
