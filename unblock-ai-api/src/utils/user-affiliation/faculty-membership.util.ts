import { OrganisationalUnitType } from "../../data/constants/organisational-unit.constant.js";
import type { OrganisationalUnitRecord } from "../../lib/types/organisational-unit/organisational-unit.type.js";

export function requiredFacultyIdOf(unit: Pick<OrganisationalUnitRecord, "unitType" | "parent">): string | null {
  return unit.unitType === OrganisationalUnitType.DEPARTMENT && unit.parent?.unitType === OrganisationalUnitType.FACULTY
    ? unit.parent.id
    : null;
}

export function isMissingFacultyMembership(
  unit: Pick<OrganisationalUnitRecord, "unitType" | "parent">,
  memberUnitIds: ReadonlySet<string>,
): boolean {
  const facultyId = requiredFacultyIdOf(unit);
  return facultyId !== null && !memberUnitIds.has(facultyId);
}
