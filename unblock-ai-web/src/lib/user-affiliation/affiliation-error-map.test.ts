import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import { UserAffiliationErrorCode, UserAffiliationIssueCode } from "@/types/user-affiliation";
import { mapAffiliationErrors } from "./affiliation-error-map";

const LOOKUP = { designationTitle: (id: string) => (id === "hod" ? "Head of Department" : "Unknown") };
const FALLBACK = "Could not save affiliations.";

describe("mapAffiliationErrors", () => {
  it("maps validation issues onto their units and unit-less issues into general messages", () => {
    const err = new ApiError("invalid", 400, UserAffiliationErrorCode.USER_AFFILIATIONS_INVALID, {
      issues: [
        { code: UserAffiliationIssueCode.DESIGNATION_NOT_APPLICABLE, organisational_unit_id: "unit-exam", designation_id: "hod" },
        { code: UserAffiliationIssueCode.TOO_MANY_MEMBERSHIPS, organisational_unit_id: null, designation_id: null },
        { code: "SOMETHING_ELSE", organisational_unit_id: "unit-exam", designation_id: null },
      ],
    });

    expect(mapAffiliationErrors(err, LOOKUP, FALLBACK)).toEqual({
      byUnit: { "unit-exam": ["Head of Department cannot be held in this kind of unit."] },
      general: ["A user can belong to at most 50 units."],
    });
  });

  it("names the current holder for single-holder conflicts", () => {
    const err = new ApiError("conflict", 409, UserAffiliationErrorCode.DESIGNATION_HOLDER_CONFLICT, {
      conflicts: [
        {
          designation_id: "hod",
          organisational_unit_id: "unit-cse",
          holder: { id: "user-1", full_name: "Chamari Gunawardena", email: "u4@u.c" },
        },
      ],
    });

    expect(mapAffiliationErrors(err, LOOKUP, FALLBACK).byUnit).toEqual({
      "unit-cse": ["Head of Department is already held by Chamari Gunawardena."],
    });
  });

  it("falls back to the API message or the fallback text", () => {
    expect(mapAffiliationErrors(new ApiError("Server down", 500), LOOKUP, FALLBACK).general).toEqual(["Server down"]);
    expect(mapAffiliationErrors(new Error("boom"), LOOKUP, FALLBACK).general).toEqual([FALLBACK]);
  });
});
