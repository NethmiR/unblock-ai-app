import { OrganisationalUnitType, ParentRequirement } from "@/types/organisational-unit";

interface HierarchyRule {
  parentRequirement: ParentRequirement;
  allowedParentType: OrganisationalUnitType | null;
}

export const ORGANISATIONAL_UNIT_HIERARCHY: Record<OrganisationalUnitType, HierarchyRule> = {
  [OrganisationalUnitType.FACULTY]: { parentRequirement: ParentRequirement.FORBIDDEN, allowedParentType: null },
  [OrganisationalUnitType.DEPARTMENT]: {
    parentRequirement: ParentRequirement.REQUIRED,
    allowedParentType: OrganisationalUnitType.FACULTY,
  },
  [OrganisationalUnitType.DIVISION]: {
    parentRequirement: ParentRequirement.OPTIONAL,
    allowedParentType: OrganisationalUnitType.FACULTY,
  },
};

export function canHaveParent(unitType: OrganisationalUnitType): boolean {
  return ORGANISATIONAL_UNIT_HIERARCHY[unitType].parentRequirement !== ParentRequirement.FORBIDDEN;
}

export function requiresParent(unitType: OrganisationalUnitType): boolean {
  return ORGANISATIONAL_UNIT_HIERARCHY[unitType].parentRequirement === ParentRequirement.REQUIRED;
}
