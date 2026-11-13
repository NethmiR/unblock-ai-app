import { DesignationCategory } from "./designation.constant.js";
import type { ActorType } from "../../lib/types/workflow/workflow.type.js";

export enum RequesterAttribute {
  FULL_NAME = "full_name",
  EMAIL = "email",
  FACULTY = "faculty",
  DEPARTMENT = "department",
  DIVISION = "division",
  DESIGNATIONS = "designations",
}

export const REQUESTER_ATTRIBUTES: readonly RequesterAttribute[] = Object.values(RequesterAttribute);

export const REQUESTER_ATTRIBUTE_INPUT_ALIASES: Readonly<Record<RequesterAttribute, readonly string[]>> = {
  [RequesterAttribute.FULL_NAME]: ["full_name", "name", "requester_name", "student_name", "staff_name", "applicant_name"],
  [RequesterAttribute.EMAIL]: ["email", "requester_email", "email_address", "student_email", "staff_email", "contact_email"],
  [RequesterAttribute.FACULTY]: ["faculty", "faculty_name", "requester_faculty"],
  [RequesterAttribute.DEPARTMENT]: ["department", "department_name", "requester_department"],
  [RequesterAttribute.DIVISION]: ["division", "division_name", "requester_division"],
  [RequesterAttribute.DESIGNATIONS]: ["designation", "designations", "position", "job_title"],
};

export const REQUESTER_DESIGNATION_SEPARATOR = ", ";

export enum RequesterProfileFactKind {
  MEMBER_OF_UNIT = "member_of_unit",
  HOLDS_DESIGNATION = "holds_designation",
}

export const REQUESTER_PROFILE_FACT_ID_PREFIX = "P";

export const REQUESTER_ACTOR_TYPES_BY_DESIGNATION_CATEGORY: Readonly<Record<DesignationCategory, readonly ActorType[]>> = {
  [DesignationCategory.LEADERSHIP]: ["faculty", "staff"],
  [DesignationCategory.ACADEMIC]: ["faculty", "staff"],
  [DesignationCategory.ACADEMIC_SUPPORT]: ["staff"],
  [DesignationCategory.ADMINISTRATIVE]: ["staff"],
  [DesignationCategory.NON_ACADEMIC]: ["staff"],
  [DesignationCategory.STUDENT]: ["student"],
};

export const UNFILTERED_SCOPE_ACTOR_TYPES: readonly ActorType[] = ["any", "external"];

export const REQUESTER_ATTRIBUTE_LABEL: Readonly<Record<RequesterAttribute, string>> = {
  [RequesterAttribute.FULL_NAME]: "Full name",
  [RequesterAttribute.EMAIL]: "Email address",
  [RequesterAttribute.FACULTY]: "Faculty",
  [RequesterAttribute.DEPARTMENT]: "Department",
  [RequesterAttribute.DIVISION]: "Division",
  [RequesterAttribute.DESIGNATIONS]: "Designations",
};

export const REQUESTER_DETAILS_ATTRIBUTES: readonly RequesterAttribute[] = [
  RequesterAttribute.FULL_NAME,
  RequesterAttribute.EMAIL,
  RequesterAttribute.FACULTY,
  RequesterAttribute.DEPARTMENT,
  RequesterAttribute.DIVISION,
];
