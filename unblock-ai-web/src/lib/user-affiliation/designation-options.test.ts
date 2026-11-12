import { describe, expect, it } from "vitest";
import { designationFixture } from "@/lib/testing/organisation-fixture";
import { singleHolderNames, toDesignationOptions } from "./designation-options";
import type { OrganisationalUnitMemberDto } from "@/types/organisational-unit";

const HEAD = designationFixture({ id: "hod", code: "head_of_department", title: "Head of Department", single_holder_per_unit: true });
const LECTURER = designationFixture();

function member(id: string, fullName: string, designationIds: string[]): OrganisationalUnitMemberDto {
  return {
    user: { id, full_name: fullName, email: `${id}@u.c` },
    designations: [HEAD, LECTURER].filter((designation) => designationIds.includes(designation.id)),
    assigned_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("singleHolderNames", () => {
  it("records other users holding single-holder designations only", () => {
    const holders = singleHolderNames(
      [member("u4", "Chamari Gunawardena", [HEAD.id, LECTURER.id]), member("u5", "Nuwan Perera", [LECTURER.id])],
      [HEAD, LECTURER],
      "u5",
    );
    expect([...holders.entries()]).toEqual([[HEAD.id, "Chamari Gunawardena"]]);
    expect(singleHolderNames([member("u4", "Chamari Gunawardena", [HEAD.id])], [HEAD], "u4").size).toBe(0);
  });
});

describe("toDesignationOptions", () => {
  it("disables single-holder designations held by someone else unless already assigned to this user", () => {
    const holders = new Map([[HEAD.id, "Chamari Gunawardena"]]);
    const [head, lecturer] = toDesignationOptions([HEAD, LECTURER], [], holders);
    expect(head).toMatchObject({ value: HEAD.id, group: "Academic", disabledReason: "Held by Chamari Gunawardena" });
    expect(lecturer.disabledReason).toBeUndefined();
    expect(toDesignationOptions([HEAD], [HEAD.id], holders)[0].disabledReason).toBeUndefined();
  });
});
