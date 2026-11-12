import { describe, expect, it } from "vitest";
import { ARCHITECTURE, CIVIL, COMPUTER_SCIENCE, ENGINEERING, unitFixture } from "@/lib/testing/organisation-fixture";
import { ArchiveFilter } from "./archive-filter";
import { filterFacultyTree } from "./organisational-unit-filter";
import { buildFacultyTree } from "./organisational-unit-tree";

const ARCHIVED_CIVIL = { ...CIVIL, is_archived: true };
const TREE = buildFacultyTree([ENGINEERING, COMPUTER_SCIENCE, ARCHIVED_CIVIL, ARCHITECTURE]);

function summarise(tree: ReturnType<typeof filterFacultyTree>) {
  return tree.map((node) => [node.faculty.code, node.departments.map((department) => department.code)]);
}

describe("filterFacultyTree", () => {
  it("shows active departments by default", () => {
    expect(summarise(filterFacultyTree(TREE, "", ArchiveFilter.ACTIVE))).toEqual([
      ["FOA", []],
      ["FOE", ["CSE"]],
    ]);
  });

  it("keeps a faculty visible when only a department matches the search", () => {
    expect(summarise(filterFacultyTree(TREE, "computer", ArchiveFilter.ACTIVE))).toEqual([["FOE", ["CSE"]]]);
  });

  it("shows every department of a faculty that matches the search", () => {
    expect(summarise(filterFacultyTree(TREE, "engineering", ArchiveFilter.ALL))).toEqual([["FOE", ["CE", "CSE"]]]);
  });

  it("shows active faculties that contain archived departments under the archived filter", () => {
    expect(summarise(filterFacultyTree(TREE, "", ArchiveFilter.ARCHIVED))).toEqual([["FOE", ["CE"]]]);
    const archivedFaculty = unitFixture({ id: "unit-old", code: "OLD", name: "Old Faculty", is_archived: true });
    expect(summarise(filterFacultyTree(buildFacultyTree([archivedFaculty]), "", ArchiveFilter.ARCHIVED))).toEqual([["OLD", []]]);
  });
});
