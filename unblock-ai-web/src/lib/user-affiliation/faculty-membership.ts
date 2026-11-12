import { OrganisationalUnitType, type OrganisationalUnitDto } from "@/types/organisational-unit";

export function requiredFacultyIdOf(unit: Pick<OrganisationalUnitDto, "unit_type" | "parent">): string | null {
  return unit.unit_type === OrganisationalUnitType.DEPARTMENT && unit.parent?.unit_type === OrganisationalUnitType.FACULTY
    ? unit.parent.id
    : null;
}

export function departmentNamesByRequiredFaculty(units: readonly OrganisationalUnitDto[]): Map<string, string[]> {
  const namesByFaculty = new Map<string, string[]>();
  for (const unit of units) {
    const facultyId = requiredFacultyIdOf(unit);
    if (facultyId !== null) namesByFaculty.set(facultyId, [...(namesByFaculty.get(facultyId) ?? []), unit.name]);
  }
  return namesByFaculty;
}
