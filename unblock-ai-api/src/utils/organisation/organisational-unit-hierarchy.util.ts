import {
  ORGANISATIONAL_UNIT_HIERARCHY,
  ParentRequirement,
  type OrganisationalUnitType,
} from "../../data/constants/organisational-unit.constant.js";

export function requiresParent(unitType: OrganisationalUnitType): boolean {
  return ORGANISATIONAL_UNIT_HIERARCHY[unitType].parentRequirement === ParentRequirement.REQUIRED;
}

export function canHaveParent(unitType: OrganisationalUnitType): boolean {
  return ORGANISATIONAL_UNIT_HIERARCHY[unitType].parentRequirement !== ParentRequirement.FORBIDDEN;
}

export function isAllowedParent(unitType: OrganisationalUnitType, parentType: OrganisationalUnitType | null): boolean {
  if (parentType === null) return !requiresParent(unitType);
  return ORGANISATIONAL_UNIT_HIERARCHY[unitType].allowedParentTypes.includes(parentType);
}
