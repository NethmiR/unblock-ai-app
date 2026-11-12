import { compareByName, effectiveFacultyOf } from "@/lib/organisation/organisational-unit-tree";
import { ORGANISATIONAL_UNIT_TYPES } from "@/types/organisational-unit";
import type { OrganisationalUnitDto, OrganisationalUnitReferenceDto } from "@/types/organisational-unit";

export interface EffectiveFacultyGroup<T> {
  faculty: OrganisationalUnitReferenceDto | null;
  items: T[];
}

function compareUnits(a: OrganisationalUnitDto, b: OrganisationalUnitDto): number {
  return (
    ORGANISATIONAL_UNIT_TYPES.indexOf(a.unit_type) - ORGANISATIONAL_UNIT_TYPES.indexOf(b.unit_type) || compareByName(a, b)
  );
}

export function groupByEffectiveFaculty<T>(
  items: readonly T[],
  unitOf: (item: T) => OrganisationalUnitDto,
): EffectiveFacultyGroup<T>[] {
  const groups = new Map<string | null, EffectiveFacultyGroup<T>>();
  for (const item of items) {
    const faculty = effectiveFacultyOf(unitOf(item));
    const key = faculty?.id ?? null;
    const group = groups.get(key) ?? { faculty, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }

  for (const group of groups.values()) group.items.sort((a, b) => compareUnits(unitOf(a), unitOf(b)));
  return [...groups.values()].sort((a, b) => {
    if (a.faculty === null) return 1;
    if (b.faculty === null) return -1;
    return compareByName(a.faculty, b.faculty);
  });
}
