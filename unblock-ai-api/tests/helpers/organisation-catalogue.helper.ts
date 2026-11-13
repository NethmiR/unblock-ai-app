import { UNIVERSITY_OF_MORATUWA_DESIGNATIONS } from "../../src/db/seed/data/university-of-moratuwa/designations.seed-data.js";
import { UNIVERSITY_OF_MORATUWA_ORGANISATIONAL_UNITS } from "../../src/db/seed/data/university-of-moratuwa/organisational-units.seed-data.js";
import { UNIVERSITY_OF_MORATUWA_SAMPLE_USERS } from "../../src/db/seed/data/university-of-moratuwa/sample-users.seed-data.js";
import { flattenOrganisationalUnitSeeds } from "../../src/utils/seed/organisation-seed.util.js";
import { toOrganisationalUnitReference } from "../../src/utils/organisation/organisational-unit-reference.util.js";
import { buildRequesterProfile } from "../../src/utils/requester/requester-profile.util.js";
import { UserStatus } from "../../src/data/constants/user.constant.js";
import type { DesignationRecord } from "../../src/lib/types/designation/designation.type.js";
import type { OrganisationCatalogue } from "../../src/lib/types/organisation/organisation-catalogue.type.js";
import type { OrganisationalUnitRecord } from "../../src/lib/types/organisational-unit/organisational-unit.type.js";
import type { RequesterProfile } from "../../src/lib/types/requester/requester.type.js";
import type { SampleUserSeed } from "../../src/lib/types/seed/sample-user-seed.type.js";
import type { UserRecord } from "../../src/lib/types/user/user.type.js";
import type { UserMembershipRecord } from "../../src/lib/types/user-affiliation/user-affiliation.type.js";

const CATALOGUE_TIMESTAMP = new Date("2026-01-01T00:00:00Z");

export function unitIdOf(code: string): string {
  return `unit-${code}`;
}

export function designationIdOf(code: string): string {
  return `designation-${code}`;
}

export function sampleUserIdOf(email: string): string {
  return `user-${email}`;
}

function buildUnits(): OrganisationalUnitRecord[] {
  const flattened = flattenOrganisationalUnitSeeds(UNIVERSITY_OF_MORATUWA_ORGANISATIONAL_UNITS);
  const byCode = new Map<string, OrganisationalUnitRecord>();
  for (const { seed, parentCode } of flattened) {
    const parent = parentCode === null ? null : byCode.get(parentCode) ?? null;
    byCode.set(seed.code, {
      id: unitIdOf(seed.code),
      code: seed.code,
      name: seed.name,
      unitType: seed.unitType,
      isArchived: false,
      parent: parent ? toOrganisationalUnitReference(parent) : null,
      description: null,
      archivedAt: null,
      createdByUserId: null,
      createdAt: CATALOGUE_TIMESTAMP,
      updatedAt: CATALOGUE_TIMESTAMP,
    });
  }
  return [...byCode.values()];
}

function buildDesignations(): DesignationRecord[] {
  return UNIVERSITY_OF_MORATUWA_DESIGNATIONS.map((seed) => ({
    id: designationIdOf(seed.code),
    code: seed.code,
    title: seed.title,
    category: seed.category,
    displayOrder: seed.displayOrder,
    isArchived: false,
    applicableUnitTypes: [...seed.applicableUnitTypes],
    singleHolderPerUnit: seed.singleHolderPerUnit,
    archivedAt: null,
    createdByUserId: null,
    createdAt: CATALOGUE_TIMESTAMP,
    updatedAt: CATALOGUE_TIMESTAMP,
  }));
}

export function buildOrganisationCatalogue(
  units: OrganisationalUnitRecord[] = buildUnits(),
  designations: DesignationRecord[] = buildDesignations(),
): OrganisationCatalogue {
  return {
    units,
    designations,
    unitsByCode: new Map(units.map((unit) => [unit.code, unit])),
    designationsByCode: new Map(designations.map((designation) => [designation.code, designation])),
  };
}

export function sampleUserSeedNamed(fullName: string): SampleUserSeed {
  const seed = UNIVERSITY_OF_MORATUWA_SAMPLE_USERS.find((user) => user.fullName === fullName);
  if (!seed) throw new Error(`No sample user named '${fullName}'`);
  return seed;
}

export function sampleUserRecord(seed: SampleUserSeed): UserRecord {
  return {
    id: sampleUserIdOf(seed.email),
    email: seed.email,
    fullName: seed.fullName,
    status: UserStatus.ACTIVE,
    permissions: [...seed.permissions],
    failedLoginCount: 0,
    lastFailedLoginAt: null,
    lastLoginAt: null,
    createdByUserId: null,
    createdAt: CATALOGUE_TIMESTAMP,
    updatedAt: CATALOGUE_TIMESTAMP,
  };
}

export function sampleMemberships(seed: SampleUserSeed, catalogue: OrganisationCatalogue): UserMembershipRecord[] {
  return seed.memberships.map((membership) => {
    const unit = catalogue.unitsByCode.get(membership.organisationalUnitCode);
    if (!unit) throw new Error(`Unknown unit '${membership.organisationalUnitCode}'`);
    return {
      organisationalUnit: unit,
      designations: membership.designationCodes.map((code) => {
        const designation = catalogue.designationsByCode.get(code);
        if (!designation) throw new Error(`Unknown designation '${code}'`);
        return designation;
      }),
      assignedAt: CATALOGUE_TIMESTAMP,
    };
  });
}

export function sampleRequesterProfile(fullName: string, catalogue: OrganisationCatalogue = buildOrganisationCatalogue()): RequesterProfile {
  const seed = sampleUserSeedNamed(fullName);
  return buildRequesterProfile(sampleUserRecord(seed), sampleMemberships(seed, catalogue));
}

export function seedOrganisationCatalogueService(): { getCatalogue(): Promise<OrganisationCatalogue> } {
  const catalogue = buildOrganisationCatalogue();
  return { getCatalogue: async () => catalogue };
}
