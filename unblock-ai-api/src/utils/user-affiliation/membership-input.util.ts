import { USER_AFFILIATION_LIMIT } from "../../data/constants/user-affiliation.constant.js";
import { UserAffiliationIssueCode } from "../../data/constants/user-affiliation-error.constant.js";
import { findDuplicates } from "../shared/collection.util.js";
import type { MembershipInput, UserAffiliationIssue } from "../../lib/types/user-affiliation/user-affiliation.type.js";

export function createAffiliationIssue(
  code: UserAffiliationIssueCode,
  organisationalUnitId: string | null = null,
  designationId: string | null = null,
): UserAffiliationIssue {
  return { code, organisationalUnitId, designationId };
}

export function findStructuralIssues(memberships: readonly MembershipInput[]): UserAffiliationIssue[] {
  const issues: UserAffiliationIssue[] = [];

  if (memberships.length > USER_AFFILIATION_LIMIT.MAX_MEMBERSHIPS) {
    issues.push(createAffiliationIssue(UserAffiliationIssueCode.TOO_MANY_MEMBERSHIPS));
  }

  for (const unitId of findDuplicates(memberships.map((membership) => membership.organisationalUnitId))) {
    issues.push(createAffiliationIssue(UserAffiliationIssueCode.DUPLICATE_ORGANISATIONAL_UNIT, unitId));
  }

  for (const membership of memberships) {
    if (membership.designationIds.length > USER_AFFILIATION_LIMIT.MAX_DESIGNATIONS_PER_MEMBERSHIP) {
      issues.push(createAffiliationIssue(UserAffiliationIssueCode.TOO_MANY_DESIGNATIONS, membership.organisationalUnitId));
    }
    for (const designationId of findDuplicates(membership.designationIds)) {
      issues.push(
        createAffiliationIssue(UserAffiliationIssueCode.DUPLICATE_DESIGNATION, membership.organisationalUnitId, designationId),
      );
    }
  }

  return issues;
}
