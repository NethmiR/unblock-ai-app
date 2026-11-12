import type { DesignationSummaryDto } from "@/types/designation";
import type { OrganisationalUnitType } from "@/types/organisational-unit";
import type { ReplaceUserAffiliationsRequest, UserAffiliationsDto } from "@/types/user-affiliation";

export interface DraftMembership {
  organisationalUnitId: string;
  designationIds: string[];
}

export interface AffiliationDraft {
  baseline: DraftMembership[];
  memberships: DraftMembership[];
}

export enum AffiliationDraftActionType {
  ADD_MEMBERSHIP = "add_membership",
  REMOVE_MEMBERSHIP = "remove_membership",
  TOGGLE_DESIGNATION = "toggle_designation",
  DISCARD = "discard",
  LOAD = "load",
}

export type AffiliationDraftAction =
  | { type: AffiliationDraftActionType.ADD_MEMBERSHIP; organisationalUnitId: string; requiredFacultyId: string | null }
  | { type: AffiliationDraftActionType.REMOVE_MEMBERSHIP; organisationalUnitId: string }
  | { type: AffiliationDraftActionType.TOGGLE_DESIGNATION; organisationalUnitId: string; designationId: string }
  | { type: AffiliationDraftActionType.DISCARD }
  | { type: AffiliationDraftActionType.LOAD; affiliations: UserAffiliationsDto };

function toDraftMemberships(affiliations: UserAffiliationsDto): DraftMembership[] {
  return affiliations.memberships.map((membership) => ({
    organisationalUnitId: membership.organisational_unit.id,
    designationIds: membership.designations.map((designation) => designation.id),
  }));
}

export function createAffiliationDraft(affiliations: UserAffiliationsDto): AffiliationDraft {
  const memberships = toDraftMemberships(affiliations);
  return { baseline: memberships, memberships };
}

function toggle(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter((candidate) => candidate !== value) : [...values, value];
}

export function affiliationDraftReducer(draft: AffiliationDraft, action: AffiliationDraftAction): AffiliationDraft {
  switch (action.type) {
    case AffiliationDraftActionType.ADD_MEMBERSHIP: {
      const unitIds = [action.requiredFacultyId, action.organisationalUnitId].filter(
        (unitId): unitId is string =>
          unitId !== null && !draft.memberships.some((membership) => membership.organisationalUnitId === unitId),
      );
      if (unitIds.length === 0) return draft;
      return {
        ...draft,
        memberships: [...draft.memberships, ...unitIds.map((organisationalUnitId) => ({ organisationalUnitId, designationIds: [] }))],
      };
    }
    case AffiliationDraftActionType.REMOVE_MEMBERSHIP:
      return {
        ...draft,
        memberships: draft.memberships.filter((membership) => membership.organisationalUnitId !== action.organisationalUnitId),
      };
    case AffiliationDraftActionType.TOGGLE_DESIGNATION:
      return {
        ...draft,
        memberships: draft.memberships.map((membership) =>
          membership.organisationalUnitId === action.organisationalUnitId
            ? { ...membership, designationIds: toggle(membership.designationIds, action.designationId) }
            : membership,
        ),
      };
    case AffiliationDraftActionType.DISCARD:
      return { ...draft, memberships: draft.baseline };
    case AffiliationDraftActionType.LOAD:
      return createAffiliationDraft(action.affiliations);
  }
}

function membershipSignature(memberships: readonly DraftMembership[]): string {
  return memberships
    .map((membership) => `${membership.organisationalUnitId}:${[...membership.designationIds].sort().join(",")}`)
    .sort()
    .join("|");
}

export function isAffiliationDraftDirty(draft: AffiliationDraft): boolean {
  return membershipSignature(draft.baseline) !== membershipSignature(draft.memberships);
}

export function toReplaceAffiliationsRequest(draft: AffiliationDraft): ReplaceUserAffiliationsRequest {
  return {
    memberships: draft.memberships.map((membership) => ({
      organisational_unit_id: membership.organisationalUnitId,
      designation_ids: [...membership.designationIds],
    })),
  };
}

export function applicableDesignations(
  unitType: OrganisationalUnitType,
  designations: readonly DesignationSummaryDto[],
  assignedIds: readonly string[],
): DesignationSummaryDto[] {
  return designations
    .filter((designation) => designation.applicable_unit_types.includes(unitType))
    .filter((designation) => !designation.is_archived || assignedIds.includes(designation.id))
    .sort((a, b) => a.display_order - b.display_order || a.title.localeCompare(b.title));
}
