import { createInMemoryRepositoryRegistry, type InMemoryRepositoryRegistry } from "../../src/repositories/repository-registry.factory.js";
import { UNIVERSITY_OF_MORATUWA_DESIGNATIONS } from "../../src/db/seed/data/university-of-moratuwa/designations.seed-data.js";
import { UNIVERSITY_OF_MORATUWA_ORGANISATIONAL_UNITS } from "../../src/db/seed/data/university-of-moratuwa/organisational-units.seed-data.js";
import { UNIVERSITY_OF_MORATUWA_SAMPLE_USERS } from "../../src/db/seed/data/university-of-moratuwa/sample-users.seed-data.js";
import { flattenOrganisationalUnitSeeds } from "../../src/utils/seed/organisation-seed.util.js";
import { OrganisationCatalogueService } from "../../src/services/organisation-catalogue.service.js";
import { UserStatus } from "../../src/data/constants/user.constant.js";
import type { OrganisationCatalogue } from "../../src/lib/types/organisation/organisation-catalogue.type.js";
import type { SampleUserSeed } from "../../src/lib/types/seed/sample-user-seed.type.js";
import type { UserCredentialRecord } from "../../src/lib/types/user/user.type.js";
import type { MembershipInput } from "../../src/lib/types/user-affiliation/user-affiliation.type.js";

const SEED_TIMESTAMP = new Date("2026-01-01T00:00:00Z");

export interface SeedWorldOptions {
  users?: readonly SampleUserSeed[];
  disabledUserNames?: readonly string[];
}

export interface SeedWorld {
  repositories: InMemoryRepositoryRegistry;
  catalogue: OrganisationCatalogue;
  userIdOf(fullName: string): string;
}

function disabledUserRecord(seed: SampleUserSeed): UserCredentialRecord {
  return {
    id: `disabled-${seed.email}`,
    email: seed.email,
    fullName: seed.fullName,
    passwordHash: "unused",
    status: UserStatus.DISABLED,
    permissions: [...seed.permissions],
    failedLoginCount: 0,
    lastFailedLoginAt: null,
    lastLoginAt: null,
    createdByUserId: null,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  };
}

export async function createSeedWorld(options: SeedWorldOptions = {}): Promise<SeedWorld> {
  const users = options.users ?? UNIVERSITY_OF_MORATUWA_SAMPLE_USERS;
  const disabledNames = new Set(options.disabledUserNames ?? []);
  const disabledRecords = users.filter((seed) => disabledNames.has(seed.fullName)).map(disabledUserRecord);
  const repositories = createInMemoryRepositoryRegistry({ users: disabledRecords });
  const { organisationalUnitRepository, designationRepository, userRepository, userAffiliationRepository } = repositories;

  const unitIds = new Map<string, string>();
  for (const { seed, parentCode } of flattenOrganisationalUnitSeeds(UNIVERSITY_OF_MORATUWA_ORGANISATIONAL_UNITS)) {
    const parent = parentCode === null ? null : await organisationalUnitRepository.findByCode(parentCode);
    const unit = await organisationalUnitRepository.create({
      code: seed.code,
      name: seed.name,
      unitType: seed.unitType,
      parent: parent ? { id: parent.id, unitType: parent.unitType } : null,
      description: null,
      createdByUserId: null,
    });
    unitIds.set(unit.code, unit.id);
  }

  const designationIds = new Map<string, string>();
  for (const seed of UNIVERSITY_OF_MORATUWA_DESIGNATIONS) {
    const designation = await designationRepository.create({ ...seed, applicableUnitTypes: [...seed.applicableUnitTypes], createdByUserId: null });
    designationIds.set(designation.code, designation.id);
  }

  const userIds = new Map<string, string>();
  for (const seed of users) {
    const user = disabledNames.has(seed.fullName)
      ? disabledUserRecord(seed)
      : await userRepository.create({
          email: seed.email,
          fullName: seed.fullName,
          passwordHash: "unused",
          permissions: [...seed.permissions],
          createdByUserId: null,
        });
    const memberships: MembershipInput[] = seed.memberships.map((membership) => ({
      organisationalUnitId: unitIds.get(membership.organisationalUnitCode) ?? "",
      designationIds: membership.designationCodes.map((code) => designationIds.get(code) ?? ""),
    }));
    await userAffiliationRepository.replaceForUser(user.id, memberships, null);
    userIds.set(seed.fullName, user.id);
  }

  const catalogue = await new OrganisationCatalogueService({ organisationalUnitRepository, designationRepository }).getCatalogue();
  return {
    repositories,
    catalogue,
    userIdOf(fullName: string): string {
      const id = userIds.get(fullName);
      if (id === undefined) throw new Error(`No seeded user named '${fullName}'`);
      return id;
    },
  };
}

export function sampleUsersWithout(...fullNames: string[]): SampleUserSeed[] {
  return UNIVERSITY_OF_MORATUWA_SAMPLE_USERS.filter((seed) => !fullNames.includes(seed.fullName));
}
