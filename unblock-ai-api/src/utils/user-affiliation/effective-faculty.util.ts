import { effectiveFacultyOf } from "../organisation/organisational-unit-reference.util.js";
import { compareText } from "../shared/text.util.js";
import type {
  OrganisationalUnitRecord,
  OrganisationalUnitReference,
} from "../../lib/types/organisational-unit/organisational-unit.type.js";

export function resolveEffectiveFaculties(units: readonly OrganisationalUnitRecord[]): OrganisationalUnitReference[] {
  const faculties = new Map<string, OrganisationalUnitReference>();
  for (const unit of units) {
    const faculty = effectiveFacultyOf(unit);
    if (faculty) faculties.set(faculty.id, faculty);
  }
  return [...faculties.values()].sort((a, b) => compareText(a.name, b.name));
}
