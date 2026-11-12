export enum DesignationCategory {
  LEADERSHIP = "leadership",
  ACADEMIC = "academic",
  ACADEMIC_SUPPORT = "academic_support",
  ADMINISTRATIVE = "administrative",
  NON_ACADEMIC = "non_academic",
  STUDENT = "student",
}

export const DESIGNATION_CATEGORIES: readonly DesignationCategory[] = Object.values(DesignationCategory);

export const DESIGNATION_FIELD_LIMIT = {
  CODE_MAX_LENGTH: 64,
  TITLE_MAX_LENGTH: 120,
  DISPLAY_ORDER_MAX: 9999,
} as const;

export const DESIGNATION_CODE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
