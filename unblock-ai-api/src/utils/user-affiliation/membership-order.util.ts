import { effectiveFacultyOf } from "../organisation/organisational-unit-reference.util.js";
import { compareOrganisationalUnitTypes } from "../organisation/organisational-unit-type.util.js";
import { compareText } from "../shared/text.util.js";
import type { OrganisationalUnitRecord } from "../../lib/types/organisational-unit/organisational-unit.type.js";
import type { UserMembershipRecord } from "../../lib/types/user-affiliation/user-affiliation.type.js";

function compareFacultyNames(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return compareText(a, b);
}

export function compareOrganisationalUnits(a: OrganisationalUnitRecord, b: OrganisationalUnitRecord): number {
  return (
    compareFacultyNames(effectiveFacultyOf(a)?.name ?? null, effectiveFacultyOf(b)?.name ?? null) ||
    compareOrganisationalUnitTypes(a.unitType, b.unitType) ||
    compareText(a.name, b.name)
  );
}

export function compareMemberships(a: UserMembershipRecord, b: UserMembershipRecord): number {
  return compareOrganisationalUnits(a.organisationalUnit, b.organisationalUnit);
}
