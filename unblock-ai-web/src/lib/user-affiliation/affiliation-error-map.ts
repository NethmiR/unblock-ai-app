import { apiErrorCode, apiErrorDetails, apiErrorMessage, isRecord } from "@/lib/api/api-error";
import {
  UserAffiliationErrorCode,
  UserAffiliationIssueCode,
  type DesignationHolderConflictDto,
  type UserAffiliationIssueDto,
} from "@/types/user-affiliation";

export interface AffiliationNameLookup {
  designationTitle: (designationId: string) => string;
}

export interface AffiliationErrorMap {
  byUnit: Record<string, string[]>;
  general: string[];
}

const USER_AFFILIATION_ISSUE_CODES: readonly string[] = Object.values(UserAffiliationIssueCode);

const ISSUE_MESSAGES: Record<UserAffiliationIssueCode, (designation: string) => string> = {
  [UserAffiliationIssueCode.DUPLICATE_ORGANISATIONAL_UNIT]: () => "This unit is listed more than once.",
  [UserAffiliationIssueCode.DUPLICATE_DESIGNATION]: (designation) => `${designation} is selected more than once.`,
  [UserAffiliationIssueCode.ORGANISATIONAL_UNIT_NOT_FOUND]: () => "This unit no longer exists. Remove it to continue.",
  [UserAffiliationIssueCode.ORGANISATIONAL_UNIT_ARCHIVED]: () => "This unit is archived and cannot be newly joined.",
  [UserAffiliationIssueCode.DESIGNATION_NOT_FOUND]: () => "A selected designation no longer exists.",
  [UserAffiliationIssueCode.DESIGNATION_ARCHIVED]: (designation) => `${designation} is archived and cannot be newly assigned.`,
  [UserAffiliationIssueCode.DESIGNATION_NOT_APPLICABLE]: (designation) => `${designation} cannot be held in this kind of unit.`,
  [UserAffiliationIssueCode.FACULTY_MEMBERSHIP_REQUIRED]: () =>
    "Members of a department must also belong to its faculty. Add the faculty to continue.",
  [UserAffiliationIssueCode.TOO_MANY_MEMBERSHIPS]: () => "A user can belong to at most 50 units.",
  [UserAffiliationIssueCode.TOO_MANY_DESIGNATIONS]: () => "A user can hold at most 10 designations in one unit.",
};

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isIssue(value: unknown): value is UserAffiliationIssueDto {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    USER_AFFILIATION_ISSUE_CODES.includes(value.code) &&
    isNullableString(value.organisational_unit_id) &&
    isNullableString(value.designation_id)
  );
}

function isConflict(value: unknown): value is DesignationHolderConflictDto {
  return (
    isRecord(value) &&
    typeof value.designation_id === "string" &&
    typeof value.organisational_unit_id === "string" &&
    isRecord(value.holder) &&
    typeof value.holder.full_name === "string"
  );
}

function listOf<T>(value: unknown, guard: (item: unknown) => item is T): T[] {
  return Array.isArray(value) ? value.filter(guard) : [];
}

function addMessage(map: AffiliationErrorMap, unitId: string | null, message: string): void {
  if (unitId === null) {
    map.general.push(message);
    return;
  }
  map.byUnit[unitId] = [...(map.byUnit[unitId] ?? []), message];
}

export function mapAffiliationErrors(err: unknown, lookup: AffiliationNameLookup, fallback: string): AffiliationErrorMap {
  const map: AffiliationErrorMap = { byUnit: {}, general: [] };
  const details = apiErrorDetails(err);
  const code = apiErrorCode(err);

  if (code === UserAffiliationErrorCode.USER_AFFILIATIONS_INVALID) {
    for (const issue of listOf(details?.issues, isIssue)) {
      const designation = issue.designation_id === null ? "" : lookup.designationTitle(issue.designation_id);
      addMessage(map, issue.organisational_unit_id, ISSUE_MESSAGES[issue.code](designation));
    }
  } else if (code === UserAffiliationErrorCode.DESIGNATION_HOLDER_CONFLICT) {
    for (const conflict of listOf(details?.conflicts, isConflict)) {
      addMessage(
        map,
        conflict.organisational_unit_id,
        `${lookup.designationTitle(conflict.designation_id)} is already held by ${conflict.holder.full_name}.`,
      );
    }
  }

  if (map.general.length === 0 && Object.keys(map.byUnit).length === 0) map.general.push(apiErrorMessage(err, fallback));
  return map;
}
