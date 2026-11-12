import { matchesArchiveFilter, type ArchiveFilter } from "./archive-filter";
import { matchesOrganisationalUnitSearch, type FacultyTreeNode } from "./organisational-unit-tree";
import type { OrganisationalUnitDto } from "@/types/organisational-unit";

export function matchesUnitFilters(unit: OrganisationalUnitDto, search: string, archiveFilter: ArchiveFilter): boolean {
  return matchesArchiveFilter(unit, archiveFilter) && matchesOrganisationalUnitSearch(unit, search);
}

export function filterFacultyTree<T extends OrganisationalUnitDto>(
  tree: readonly FacultyTreeNode<T>[],
  search: string,
  archiveFilter: ArchiveFilter,
): FacultyTreeNode<T>[] {
  return tree.flatMap((node) => {
    const facultyMatchesSearch = matchesOrganisationalUnitSearch(node.faculty, search);
    const departments = node.departments.filter(
      (department) =>
        matchesArchiveFilter(department, archiveFilter) &&
        (facultyMatchesSearch || matchesOrganisationalUnitSearch(department, search)),
    );
    const facultyVisible = matchesUnitFilters(node.faculty, search, archiveFilter) || departments.length > 0;
    return facultyVisible ? [{ ...node, departments }] : [];
  });
}
