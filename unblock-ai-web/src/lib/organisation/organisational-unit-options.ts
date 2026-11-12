import { ORGANISATIONAL_UNIT_TYPE_LABELS } from "./organisational-unit-label";
import { compareByName, effectiveFacultyOf } from "./organisational-unit-tree";
import { ORGANISATION_COPY } from "./organisation-copy";
import { ORGANISATIONAL_UNIT_TYPES, OrganisationalUnitType } from "@/types/organisational-unit";
import type { ComboboxOption } from "@/types/combobox";
import type { OrganisationalUnitDto } from "@/types/organisational-unit";

export function toFacultyOptions(units: readonly OrganisationalUnitDto[]): ComboboxOption[] {
  return units
    .filter((unit) => unit.unit_type === OrganisationalUnitType.FACULTY && !unit.is_archived)
    .sort(compareByName)
    .map((unit) => ({ value: unit.id, label: unit.name, meta: unit.code }));
}

function groupLabel(unit: OrganisationalUnitDto): string {
  const typeLabel = ORGANISATIONAL_UNIT_TYPE_LABELS[unit.unit_type].plural;
  if (unit.unit_type === OrganisationalUnitType.FACULTY) return typeLabel;
  const faculty = effectiveFacultyOf(unit);
  return `${typeLabel} · ${faculty?.name ?? ORGANISATION_COPY.universityLevel}`;
}

export function toGroupedUnitOptions(units: readonly OrganisationalUnitDto[]): ComboboxOption[] {
  return [...units]
    .sort((a, b) => {
      const typeOrder = ORGANISATIONAL_UNIT_TYPES.indexOf(a.unit_type) - ORGANISATIONAL_UNIT_TYPES.indexOf(b.unit_type);
      return typeOrder || groupLabel(a).localeCompare(groupLabel(b)) || compareByName(a, b);
    })
    .map((unit) => ({ value: unit.id, label: unit.name, meta: unit.code, group: groupLabel(unit) }));
}
