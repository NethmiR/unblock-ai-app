import { OrganisationalUnitType } from "../../data/constants/organisational-unit.constant.js";
import type {
  OrganisationalUnitRecord,
  OrganisationalUnitReference,
} from "../../lib/types/organisational-unit/organisational-unit.type.js";

export function toOrganisationalUnitReference(unit: OrganisationalUnitReference): OrganisationalUnitReference {
  return { id: unit.id, code: unit.code, name: unit.name, unitType: unit.unitType, isArchived: unit.isArchived };
}

export function effectiveFacultyOf(unit: OrganisationalUnitRecord): OrganisationalUnitReference | null {
  if (unit.unitType === OrganisationalUnitType.FACULTY) return toOrganisationalUnitReference(unit);
  return unit.parent?.unitType === OrganisationalUnitType.FACULTY ? toOrganisationalUnitReference(unit.parent) : null;
}
