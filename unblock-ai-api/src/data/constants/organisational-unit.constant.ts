export enum OrganisationalUnitType {
  FACULTY = "faculty",
  DEPARTMENT = "department",
  DIVISION = "division",
}

export const ORGANISATIONAL_UNIT_TYPES: readonly OrganisationalUnitType[] = Object.values(OrganisationalUnitType);

export enum ParentRequirement {
  FORBIDDEN = "forbidden",
  REQUIRED = "required",
  OPTIONAL = "optional",
}

export interface OrganisationalUnitHierarchyRule {
  parentRequirement: ParentRequirement;
  allowedParentTypes: readonly OrganisationalUnitType[];
}

export const ORGANISATIONAL_UNIT_HIERARCHY: Readonly<Record<OrganisationalUnitType, OrganisationalUnitHierarchyRule>> = {
  [OrganisationalUnitType.FACULTY]: {
    parentRequirement: ParentRequirement.FORBIDDEN,
    allowedParentTypes: [],
  },
  [OrganisationalUnitType.DEPARTMENT]: {
    parentRequirement: ParentRequirement.REQUIRED,
    allowedParentTypes: [OrganisationalUnitType.FACULTY],
  },
  [OrganisationalUnitType.DIVISION]: {
    parentRequirement: ParentRequirement.OPTIONAL,
    allowedParentTypes: [OrganisationalUnitType.FACULTY],
  },
};

export const ORGANISATIONAL_UNIT_FIELD_LIMIT = {
  CODE_MAX_LENGTH: 24,
  NAME_MAX_LENGTH: 200,
  DESCRIPTION_MAX_LENGTH: 1000,
} as const;

export const ORGANISATIONAL_UNIT_CODE_PATTERN = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/;
