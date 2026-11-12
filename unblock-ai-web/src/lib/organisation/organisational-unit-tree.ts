import { OrganisationalUnitType } from "@/types/organisational-unit";
import type { OrganisationalUnitDto, OrganisationalUnitReferenceDto } from "@/types/organisational-unit";

export const ORGANISATIONAL_UNIT_PATH_SEPARATOR = " › ";

export interface FacultyTreeNode<T extends OrganisationalUnitDto> {
  faculty: T;
  departments: T[];
  divisions: T[];
}

export interface DivisionScopeGroup<T extends OrganisationalUnitDto> {
  faculty: OrganisationalUnitReferenceDto | null;
  divisions: T[];
}

export function compareByName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
}

export function buildFacultyTree<T extends OrganisationalUnitDto>(units: readonly T[]): FacultyTreeNode<T>[] {
  const childrenOf = (facultyId: string, unitType: OrganisationalUnitType): T[] =>
    units.filter((unit) => unit.unit_type === unitType && unit.parent?.id === facultyId).sort(compareByName);

  return units
    .filter((unit) => unit.unit_type === OrganisationalUnitType.FACULTY)
    .sort(compareByName)
    .map((faculty) => ({
      faculty,
      departments: childrenOf(faculty.id, OrganisationalUnitType.DEPARTMENT),
      divisions: childrenOf(faculty.id, OrganisationalUnitType.DIVISION),
    }));
}

export function groupDivisionsByScope<T extends OrganisationalUnitDto>(units: readonly T[]): DivisionScopeGroup<T>[] {
  const divisions = units.filter((unit) => unit.unit_type === OrganisationalUnitType.DIVISION).sort(compareByName);
  const universityLevel = divisions.filter((division) => division.parent === null);
  const faculties = new Map<string, OrganisationalUnitReferenceDto>();
  for (const division of divisions) if (division.parent) faculties.set(division.parent.id, division.parent);

  const facultyGroups = [...faculties.values()].sort(compareByName).map((faculty) => ({
    faculty,
    divisions: divisions.filter((division) => division.parent?.id === faculty.id),
  }));
  return universityLevel.length > 0 ? [{ faculty: null, divisions: universityLevel }, ...facultyGroups] : facultyGroups;
}

export function effectiveFacultyOf(unit: OrganisationalUnitDto): OrganisationalUnitReferenceDto | null {
  if (unit.unit_type === OrganisationalUnitType.FACULTY) return unit;
  return unit.parent?.unit_type === OrganisationalUnitType.FACULTY ? unit.parent : null;
}

export function formatOrganisationalUnitPath(unit: OrganisationalUnitDto): string {
  return unit.parent ? `${unit.parent.name}${ORGANISATIONAL_UNIT_PATH_SEPARATOR}${unit.name}` : unit.name;
}

export function matchesOrganisationalUnitSearch(unit: OrganisationalUnitReferenceDto, search: string): boolean {
  const term = search.trim().toLowerCase();
  return term === "" || unit.name.toLowerCase().includes(term) || unit.code.toLowerCase().includes(term);
}
