import { ConflictError } from "./conflict.error.js";
import { ValidationError } from "./validation.error.js";
import { UserAffiliationErrorCode, UserAffiliationIssueCode } from "../data/constants/user-affiliation-error.constant.js";
import type {
  DesignationHolderConflictDto,
  DesignationHolderRecord,
  UserAffiliationIssue,
  UserAffiliationIssueDto,
} from "../lib/types/user-affiliation/user-affiliation.type.js";

function toIssueDto(issue: UserAffiliationIssue): UserAffiliationIssueDto {
  return {
    code: issue.code,
    organisational_unit_id: issue.organisationalUnitId,
    designation_id: issue.designationId,
  };
}

function toHolderConflictDto(conflict: DesignationHolderRecord): DesignationHolderConflictDto {
  return {
    designation_id: conflict.designationId,
    organisational_unit_id: conflict.organisationalUnitId,
    holder: { id: conflict.holder.id, full_name: conflict.holder.fullName, email: conflict.holder.email },
  };
}

export class UserAffiliationValidationError extends ValidationError {
  readonly issues: readonly UserAffiliationIssue[];

  constructor(issues: readonly UserAffiliationIssue[]) {
    super("The affiliations contain invalid entries", {
      code: UserAffiliationErrorCode.USER_AFFILIATIONS_INVALID,
      details: { issues: issues.map(toIssueDto) },
    });
    this.issues = issues;
  }
}

export function facultyMembershipRequired(departmentIds: readonly string[] = []): UserAffiliationValidationError {
  const unitIds = departmentIds.length > 0 ? departmentIds : [null];
  return new UserAffiliationValidationError(
    unitIds.map((organisationalUnitId) => ({
      code: UserAffiliationIssueCode.FACULTY_MEMBERSHIP_REQUIRED,
      organisationalUnitId,
      designationId: null,
    })),
  );
}

export function designationHolderConflict(conflicts: readonly DesignationHolderRecord[] = []): ConflictError {
  return new ConflictError("A single-holder designation is already held by someone else in that unit", {
    code: UserAffiliationErrorCode.DESIGNATION_HOLDER_CONFLICT,
    details: { conflicts: conflicts.map(toHolderConflictDto) },
  });
}
