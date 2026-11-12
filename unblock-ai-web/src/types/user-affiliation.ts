import type { DesignationReferenceDto } from "./designation";
import type { OrganisationalUnitDto, OrganisationalUnitReferenceDto } from "./organisational-unit";
import type { UserReferenceDto } from "./user";

export enum UserAffiliationErrorCode {
  USER_AFFILIATIONS_INVALID = "USER_AFFILIATIONS_INVALID",
  DESIGNATION_HOLDER_CONFLICT = "DESIGNATION_HOLDER_CONFLICT",
}

export enum UserAffiliationIssueCode {
  DUPLICATE_ORGANISATIONAL_UNIT = "DUPLICATE_ORGANISATIONAL_UNIT",
  DUPLICATE_DESIGNATION = "DUPLICATE_DESIGNATION",
  ORGANISATIONAL_UNIT_NOT_FOUND = "ORGANISATIONAL_UNIT_NOT_FOUND",
  ORGANISATIONAL_UNIT_ARCHIVED = "ORGANISATIONAL_UNIT_ARCHIVED",
  DESIGNATION_NOT_FOUND = "DESIGNATION_NOT_FOUND",
  DESIGNATION_ARCHIVED = "DESIGNATION_ARCHIVED",
  DESIGNATION_NOT_APPLICABLE = "DESIGNATION_NOT_APPLICABLE",
  FACULTY_MEMBERSHIP_REQUIRED = "FACULTY_MEMBERSHIP_REQUIRED",
  TOO_MANY_MEMBERSHIPS = "TOO_MANY_MEMBERSHIPS",
  TOO_MANY_DESIGNATIONS = "TOO_MANY_DESIGNATIONS",
}

export interface UserMembershipDto {
  organisational_unit: OrganisationalUnitDto;
  designations: DesignationReferenceDto[];
  assigned_at: string;
}

export interface UserAffiliationsDto {
  memberships: UserMembershipDto[];
  effective_faculties: OrganisationalUnitReferenceDto[];
}

export interface UserAffiliationsResponse {
  affiliations: UserAffiliationsDto;
}

export interface MembershipRequest {
  organisational_unit_id: string;
  designation_ids: string[];
}

export interface ReplaceUserAffiliationsRequest {
  memberships: MembershipRequest[];
}

export interface UserAffiliationIssueDto {
  code: UserAffiliationIssueCode;
  organisational_unit_id: string | null;
  designation_id: string | null;
}

export interface DesignationHolderConflictDto {
  designation_id: string;
  organisational_unit_id: string;
  holder: UserReferenceDto;
}

export interface UserAffiliationIssueDetails {
  issues: UserAffiliationIssueDto[];
}

export interface DesignationHolderConflictDetails {
  conflicts: DesignationHolderConflictDto[];
}
