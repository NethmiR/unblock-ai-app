import {
  ORGANISATIONAL_UNIT_TYPES,
  OrganisationalUnitType,
} from "../../data/constants/organisational-unit.constant.js";

export function compareOrganisationalUnitTypes(a: OrganisationalUnitType, b: OrganisationalUnitType): number {
  return ORGANISATIONAL_UNIT_TYPES.indexOf(a) - ORGANISATIONAL_UNIT_TYPES.indexOf(b);
}

export function sortOrganisationalUnitTypes(unitTypes: readonly OrganisationalUnitType[]): OrganisationalUnitType[] {
  return [...unitTypes].sort(compareOrganisationalUnitTypes);
}

export function emptyCountByUnitType(): Record<OrganisationalUnitType, number> {
  return {
    [OrganisationalUnitType.FACULTY]: 0,
    [OrganisationalUnitType.DEPARTMENT]: 0,
    [OrganisationalUnitType.DIVISION]: 0,
  };
}
