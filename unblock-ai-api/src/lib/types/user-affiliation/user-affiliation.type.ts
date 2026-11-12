import type { UserAffiliationIssueCode } from "../../../data/constants/user-affiliation-error.constant.js";
import type { DesignationReference, DesignationReferenceDto } from "../designation/designation.type.js";
import type {
  OrganisationalUnitDto,
  OrganisationalUnitRecord,
  OrganisationalUnitReference,
  OrganisationalUnitReferenceDto,
} from "../organisational-unit/organisational-unit.type.js";
import type { UserReference, UserReferenceDto } from "../user/user.type.js";

export interface UserMembershipRecord {
  organisationalUnit: OrganisationalUnitRecord;
  designations: DesignationReference[];
  assignedAt: Date;
}

export interface UserAffiliationsRecord {
  memberships: UserMembershipRecord[];
  effectiveFaculties: OrganisationalUnitReference[];
}

export interface MembershipInput {
  organisationalUnitId: string;
  designationIds: string[];
}

export interface ReplaceUserAffiliationsInput {
  memberships: MembershipInput[];
}

export interface DesignationAssignmentKey {
  designationId: string;
  organisationalUnitId: string;
}

export interface UserDesignationAssignmentKey extends DesignationAssignmentKey {
  userId: string;
}

export interface DesignationHolderRecord extends DesignationAssignmentKey {
  holder: UserReference;
}

export interface UserAffiliationIssue {
  code: UserAffiliationIssueCode;
  organisationalUnitId: string | null;
  designationId: string | null;
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
