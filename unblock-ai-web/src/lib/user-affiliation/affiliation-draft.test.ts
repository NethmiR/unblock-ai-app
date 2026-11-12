import { describe, expect, it } from "vitest";
import { COMPUTER_SCIENCE, ENGINEERING, EXAMINATIONS, designationFixture } from "@/lib/testing/organisation-fixture";
import { OrganisationalUnitType } from "@/types/organisational-unit";
import type { UserAffiliationsDto } from "@/types/user-affiliation";
import {
  AffiliationDraftActionType,
  affiliationDraftReducer,
  applicableDesignations,
  createAffiliationDraft,
  isAffiliationDraftDirty,
  toReplaceAffiliationsRequest,
} from "./affiliation-draft";

const LECTURER = designationFixture();
const HEAD = designationFixture({
  id: "designation-hod",
  code: "head_of_department",
  title: "Head of Department",
  display_order: 70,
  applicable_unit_types: [OrganisationalUnitType.DEPARTMENT],
  single_holder_per_unit: true,
});
const DIRECTOR = designationFixture({
  id: "designation-director",
  code: "director",
  title: "Director",
  display_order: 80,
  applicable_unit_types: [OrganisationalUnitType.DIVISION],
});

const AFFILIATIONS: UserAffiliationsDto = {
  memberships: [{ organisational_unit: COMPUTER_SCIENCE, designations: [LECTURER], assigned_at: "2026-01-01T00:00:00.000Z" }],
  effective_faculties: [],
};

describe("affiliationDraftReducer", () => {
  it("starts clean from the saved affiliations", () => {
    const draft = createAffiliationDraft(AFFILIATIONS);
    expect(draft.memberships).toEqual([{ organisationalUnitId: COMPUTER_SCIENCE.id, designationIds: [LECTURER.id] }]);
    expect(isAffiliationDraftDirty(draft)).toBe(false);
  });

  it("adds a membership once, toggles designations and tracks dirtiness order-insensitively", () => {
    let draft = createAffiliationDraft(AFFILIATIONS);
    draft = affiliationDraftReducer(draft, { type: AffiliationDraftActionType.ADD_MEMBERSHIP, organisationalUnitId: EXAMINATIONS.id, requiredFacultyId: null });
    draft = affiliationDraftReducer(draft, { type: AffiliationDraftActionType.ADD_MEMBERSHIP, organisationalUnitId: EXAMINATIONS.id, requiredFacultyId: null });
    expect(draft.memberships).toHaveLength(2);
    expect(isAffiliationDraftDirty(draft)).toBe(true);

    draft = affiliationDraftReducer(draft, { type: AffiliationDraftActionType.REMOVE_MEMBERSHIP, organisationalUnitId: EXAMINATIONS.id });
    expect(isAffiliationDraftDirty(draft)).toBe(false);

    draft = affiliationDraftReducer(draft, {
      type: AffiliationDraftActionType.TOGGLE_DESIGNATION,
      organisationalUnitId: COMPUTER_SCIENCE.id,
      designationId: HEAD.id,
    });
    expect(draft.memberships[0].designationIds).toEqual([LECTURER.id, HEAD.id]);
    expect(isAffiliationDraftDirty(draft)).toBe(true);

    draft = affiliationDraftReducer(draft, {
      type: AffiliationDraftActionType.TOGGLE_DESIGNATION,
      organisationalUnitId: COMPUTER_SCIENCE.id,
      designationId: HEAD.id,
    });
    expect(isAffiliationDraftDirty(draft)).toBe(false);
  });

  it("adds a department's faculty alongside it, once", () => {
    let draft = createAffiliationDraft({ memberships: [], effective_faculties: [] });
    draft = affiliationDraftReducer(draft, {
      type: AffiliationDraftActionType.ADD_MEMBERSHIP,
      organisationalUnitId: COMPUTER_SCIENCE.id,
      requiredFacultyId: ENGINEERING.id,
    });
    expect(draft.memberships).toEqual([
      { organisationalUnitId: ENGINEERING.id, designationIds: [] },
      { organisationalUnitId: COMPUTER_SCIENCE.id, designationIds: [] },
    ]);

    const again = affiliationDraftReducer(draft, {
      type: AffiliationDraftActionType.ADD_MEMBERSHIP,
      organisationalUnitId: COMPUTER_SCIENCE.id,
      requiredFacultyId: ENGINEERING.id,
    });
    expect(again).toBe(draft);
  });

  it("discards back to the baseline and reloads a new baseline", () => {
    let draft = affiliationDraftReducer(createAffiliationDraft(AFFILIATIONS), {
      type: AffiliationDraftActionType.REMOVE_MEMBERSHIP,
      organisationalUnitId: COMPUTER_SCIENCE.id,
    });
    draft = affiliationDraftReducer(draft, { type: AffiliationDraftActionType.DISCARD });
    expect(isAffiliationDraftDirty(draft)).toBe(false);

    draft = affiliationDraftReducer(draft, {
      type: AffiliationDraftActionType.LOAD,
      affiliations: { memberships: [], effective_faculties: [] },
    });
    expect(draft).toEqual({ baseline: [], memberships: [] });
  });

  it("builds the replace request", () => {
    expect(toReplaceAffiliationsRequest(createAffiliationDraft(AFFILIATIONS))).toEqual({
      memberships: [{ organisational_unit_id: COMPUTER_SCIENCE.id, designation_ids: [LECTURER.id] }],
    });
  });
});

describe("applicableDesignations", () => {
  it("keeps designations for the unit type, ordered by display order, hiding archived ones unless assigned", () => {
    const archived = designationFixture({ id: "designation-old", code: "old", title: "Old", is_archived: true, display_order: 10 });
    const all = [LECTURER, DIRECTOR, HEAD, archived];

    expect(applicableDesignations(OrganisationalUnitType.DEPARTMENT, all, []).map((designation) => designation.code)).toEqual([
      "head_of_department",
      "lecturer",
    ]);
    expect(applicableDesignations(OrganisationalUnitType.DEPARTMENT, all, [archived.id]).map((designation) => designation.code)).toEqual([
      "old",
      "head_of_department",
      "lecturer",
    ]);
  });
});
