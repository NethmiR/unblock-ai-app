import { OrganisationalUnitType } from "../../data/constants/organisational-unit.constant.js";
import { REQUESTER_DESIGNATION_SEPARATOR, RequesterAttribute } from "../../data/constants/requester.constant.js";
import type { RequesterAttributeValues, RequesterProfile } from "../../lib/types/requester/requester.type.js";
import type { OrganisationalUnitReference } from "../../lib/types/organisational-unit/organisational-unit.type.js";

function singleName(units: readonly OrganisationalUnitReference[]): string | null {
  const names = new Set(units.map((unit) => unit.name));
  const [only] = names;
  return names.size === 1 && only !== undefined ? only : null;
}

function unitsOfType(profile: RequesterProfile, unitType: OrganisationalUnitType): OrganisationalUnitReference[] {
  return profile.units.map(({ unit }) => unit).filter((unit) => unit.unitType === unitType);
}

function designationTitles(profile: RequesterProfile): string | null {
  const titles = new Set(profile.units.flatMap(({ designations }) => designations.map((designation) => designation.title)));
  return titles.size > 0 ? [...titles].join(REQUESTER_DESIGNATION_SEPARATOR) : null;
}

export function requesterAttributeValues(profile: RequesterProfile): RequesterAttributeValues {
  return {
    [RequesterAttribute.FULL_NAME]: profile.fullName,
    [RequesterAttribute.EMAIL]: profile.email,
    [RequesterAttribute.FACULTY]: singleName(profile.effectiveFaculties),
    [RequesterAttribute.DEPARTMENT]: singleName(unitsOfType(profile, OrganisationalUnitType.DEPARTMENT)),
    [RequesterAttribute.DIVISION]: singleName(unitsOfType(profile, OrganisationalUnitType.DIVISION)),
    [RequesterAttribute.DESIGNATIONS]: designationTitles(profile),
  };
}
