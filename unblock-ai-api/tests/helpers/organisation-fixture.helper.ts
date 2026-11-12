import { OrganisationalUnitType } from "../../src/data/constants/organisational-unit.constant.js";
import { DesignationCategory } from "../../src/data/constants/designation.constant.js";
import type { OrganisationalUnitRecord } from "../../src/lib/types/organisational-unit/organisational-unit.type.js";
import type { DesignationReference } from "../../src/lib/types/designation/designation.type.js";

const FIXTURE_TIMESTAMP = new Date("2026-01-01T00:00:00Z");

export function organisationalUnitRecord(overrides: Partial<OrganisationalUnitRecord> = {}): OrganisationalUnitRecord {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    code: "FOE",
    name: "Faculty of Engineering",
    unitType: OrganisationalUnitType.FACULTY,
    isArchived: false,
    parent: null,
    description: null,
    archivedAt: null,
    createdByUserId: null,
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

export function designationReference(overrides: Partial<DesignationReference> = {}): DesignationReference {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    code: "lecturer",
    title: "Lecturer",
    category: DesignationCategory.ACADEMIC,
    displayOrder: 0,
    isArchived: false,
    ...overrides,
  };
}
