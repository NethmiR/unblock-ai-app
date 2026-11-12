import { DesignationCategory, type DesignationSummaryDto } from "@/types/designation";
import { OrganisationalUnitType, type OrganisationalUnitSummaryDto } from "@/types/organisational-unit";

const TIMESTAMP = "2026-01-01T00:00:00.000Z";

export function unitFixture(overrides: Partial<OrganisationalUnitSummaryDto> = {}): OrganisationalUnitSummaryDto {
  return {
    id: "unit-foe",
    code: "FOE",
    name: "Faculty of Engineering",
    unit_type: OrganisationalUnitType.FACULTY,
    is_archived: false,
    parent: null,
    description: null,
    archived_at: null,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    member_count: 0,
    child_count: 0,
    active_child_count: 0,
    ...overrides,
  };
}

export function designationFixture(overrides: Partial<DesignationSummaryDto> = {}): DesignationSummaryDto {
  return {
    id: "designation-lecturer",
    code: "lecturer",
    title: "Lecturer",
    category: DesignationCategory.ACADEMIC,
    display_order: 140,
    is_archived: false,
    applicable_unit_types: [OrganisationalUnitType.FACULTY, OrganisationalUnitType.DEPARTMENT],
    single_holder_per_unit: false,
    archived_at: null,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    holder_count: 0,
    ...overrides,
  };
}

export const ENGINEERING = unitFixture();
export const ARCHITECTURE = unitFixture({ id: "unit-foa", code: "FOA", name: "Faculty of Architecture" });
export const COMPUTER_SCIENCE = unitFixture({
  id: "unit-cse",
  code: "CSE",
  name: "Department of Computer Science & Engineering",
  unit_type: OrganisationalUnitType.DEPARTMENT,
  parent: ENGINEERING,
});
export const CIVIL = unitFixture({
  id: "unit-ce",
  code: "CE",
  name: "Department of Civil Engineering",
  unit_type: OrganisationalUnitType.DEPARTMENT,
  parent: ENGINEERING,
});
export const ENGINEERING_UNDERGRADUATE = unitFixture({
  id: "unit-foe-ugsd",
  code: "FOE-UGSD",
  name: "Undergraduate Studies Division",
  unit_type: OrganisationalUnitType.DIVISION,
  parent: ENGINEERING,
});
export const EXAMINATIONS = unitFixture({
  id: "unit-exam",
  code: "EXAM",
  name: "Examinations & Registration Division",
  unit_type: OrganisationalUnitType.DIVISION,
});
