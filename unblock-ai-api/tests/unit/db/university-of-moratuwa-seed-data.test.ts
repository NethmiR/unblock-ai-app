import test from "node:test";
import assert from "node:assert/strict";
import { UNIVERSITY_OF_MORATUWA_ORGANISATIONAL_UNITS } from "../../../src/db/seed/data/university-of-moratuwa/organisational-units.seed-data.js";
import { UNIVERSITY_OF_MORATUWA_DESIGNATIONS } from "../../../src/db/seed/data/university-of-moratuwa/designations.seed-data.js";
import organisationalUnitSeeder from "../../../src/db/seed/postgres/seeders/20261111063459_university-of-moratuwa-organisational-units.seeder.js";
import designationSeeder from "../../../src/db/seed/postgres/seeders/20261111063506_university-of-moratuwa-designations.seeder.js";
import sampleUserSeeder from "../../../src/db/seed/postgres/seeders/20261111065643_university-of-moratuwa-sample-users.seeder.js";
import { UNIVERSITY_OF_MORATUWA_SAMPLE_USERS } from "../../../src/db/seed/data/university-of-moratuwa/sample-users.seed-data.js";
import { UserAffiliationService } from "../../../src/services/user-affiliation.service.js";
import { flattenOrganisationalUnitSeeds } from "../../../src/utils/seed/organisation-seed.util.js";
import { isValidOrganisationalUnitCode } from "../../../src/utils/organisation/organisational-unit-code.util.js";
import { isValidDesignationCode } from "../../../src/utils/organisation/designation-code.util.js";
import { isAllowedParent } from "../../../src/utils/organisation/organisational-unit-hierarchy.util.js";
import { findDuplicates } from "../../../src/utils/shared/collection.util.js";
import { createInMemoryRepositoryRegistry } from "../../../src/repositories/repository-registry.factory.js";
import { UserService } from "../../../src/services/user.service.js";
import { OrganisationalUnitService } from "../../../src/services/organisational-unit.service.js";
import { DesignationService } from "../../../src/services/designation.service.js";
import { OrganisationalUnitType } from "../../../src/data/constants/organisational-unit.constant.js";
import { SeedOutcomeStatus } from "../../../src/data/constants/seed.constant.js";
import type { PostgresSeedContext } from "../../../src/db/seed/postgres/postgres.seed-context.js";

const flattened = flattenOrganisationalUnitSeeds(UNIVERSITY_OF_MORATUWA_ORGANISATIONAL_UNITS);

function inMemorySeedContext(sampleUsersEnabled = true): PostgresSeedContext {
  const repositories = createInMemoryRepositoryRegistry();
  return {
    userService: new UserService({ ...repositories, userConfig: { defaultPassword: "unused" } }),
    organisationalUnitService: new OrganisationalUnitService(repositories),
    designationService: new DesignationService(repositories),
    userAffiliationService: new UserAffiliationService(repositories),
    seedConfig: { administratorEmail: "admin@example.com", administratorFullName: "Administrator", sampleUsersEnabled },
  };
}

test("sample users follow the ux@u.c format in sequence and reference seeded units and designations", () => {
  const unitTypes = new Map(flattened.map(({ seed }) => [seed.code, seed.unitType]));
  const designations = new Map(UNIVERSITY_OF_MORATUWA_DESIGNATIONS.map((designation) => [designation.code, designation]));
  const singleHolderKeys: string[] = [];

  UNIVERSITY_OF_MORATUWA_SAMPLE_USERS.forEach((user, index) => {
    assert.equal(user.email, `u${index + 1}@u.c`);
    assert.ok(user.permissions.length > 0, user.email);
    assert.deepEqual(findDuplicates(user.memberships.map((membership) => membership.organisationalUnitCode)), [], user.email);

    for (const membership of user.memberships) {
      const unitType = unitTypes.get(membership.organisationalUnitCode);
      assert.ok(unitType, `${user.email} ${membership.organisationalUnitCode}`);
      for (const code of membership.designationCodes) {
        const designation = designations.get(code);
        assert.ok(designation, `${user.email} ${code}`);
        assert.ok(designation.applicableUnitTypes.includes(unitType), `${user.email} ${code} in ${membership.organisationalUnitCode}`);
        if (designation.singleHolderPerUnit) singleHolderKeys.push(`${code}@${membership.organisationalUnitCode}`);
      }
    }
  });
  assert.deepEqual(findDuplicates(singleHolderKeys), []);
});

test("every sample user in a department is also a member of that department's faculty", () => {
  const parentCodes = new Map(flattened.map(({ seed, parentCode }) => [seed.code, parentCode]));
  const unitTypes = new Map(flattened.map(({ seed }) => [seed.code, seed.unitType]));

  for (const user of UNIVERSITY_OF_MORATUWA_SAMPLE_USERS) {
    const unitCodes = new Set(user.memberships.map((membership) => membership.organisationalUnitCode));
    for (const code of unitCodes) {
      if (unitTypes.get(code) !== OrganisationalUnitType.DEPARTMENT) continue;
      const facultyCode = parentCodes.get(code);
      assert.ok(facultyCode && unitCodes.has(facultyCode), `${user.email} is in ${code} but not in ${facultyCode}`);
    }
  }
});

test("the sample users seeder does nothing unless enabled", async () => {
  assert.deepEqual(await sampleUserSeeder.run(inMemorySeedContext(false)), []);
});

test("flattenOrganisationalUnitSeeds lists every parent before its children", () => {
  const position = new Map(flattened.map(({ seed }, index) => [seed.code, index]));
  for (const { seed, parentCode } of flattened) {
    if (parentCode !== null) assert.ok(position.get(parentCode)! < position.get(seed.code)!, seed.code);
  }
});

test("the UoM catalogue has six faculties and departments only under faculties", () => {
  const faculties = flattened.filter(({ seed }) => seed.unitType === OrganisationalUnitType.FACULTY);
  assert.deepEqual(
    faculties.map(({ seed }) => seed.code),
    ["FOA", "FOB", "FOE", "FGS", "FIT", "FOM"],
  );
  const parentTypes = new Map(flattened.map(({ seed }) => [seed.code, seed.unitType]));
  for (const { seed, parentCode } of flattened) {
    assert.ok(isAllowedParent(seed.unitType, parentCode === null ? null : parentTypes.get(parentCode)!), seed.code);
  }
});

test("unit codes are unique and well formed, and names are unique among siblings", () => {
  const codes = flattened.map(({ seed }) => seed.code);
  assert.deepEqual(findDuplicates(codes), []);
  for (const code of codes) assert.ok(isValidOrganisationalUnitCode(code), code);

  const siblingKeys = flattened.map(({ seed, parentCode }) => `${parentCode}|${seed.unitType}|${seed.name.toLowerCase()}`);
  assert.deepEqual(findDuplicates(siblingKeys), []);
});

test("designation codes and titles are unique and every designation applies to a unit type", () => {
  assert.deepEqual(findDuplicates(UNIVERSITY_OF_MORATUWA_DESIGNATIONS.map((designation) => designation.code)), []);
  assert.deepEqual(findDuplicates(UNIVERSITY_OF_MORATUWA_DESIGNATIONS.map((designation) => designation.title.toLowerCase())), []);
  for (const designation of UNIVERSITY_OF_MORATUWA_DESIGNATIONS) {
    assert.ok(isValidDesignationCode(designation.code), designation.code);
    assert.ok(designation.applicableUnitTypes.length > 0, designation.code);
    assert.deepEqual(findDuplicates(designation.applicableUnitTypes), [], designation.code);
  }
});

test("every UoM seeder creates everything once and skips everything on a second run", async () => {
  const context = inMemorySeedContext();

  for (const [seeder, expectedCount] of [
    [organisationalUnitSeeder, flattened.length],
    [designationSeeder, UNIVERSITY_OF_MORATUWA_DESIGNATIONS.length],
    [sampleUserSeeder, UNIVERSITY_OF_MORATUWA_SAMPLE_USERS.length],
  ] as const) {
    const firstRun = await seeder.run(context);
    assert.equal(firstRun.length, expectedCount);
    assert.ok(firstRun.every((outcome) => outcome.status === SeedOutcomeStatus.CREATED));

    const secondRun = await seeder.run(context);
    assert.ok(secondRun.every((outcome) => outcome.status === SeedOutcomeStatus.SKIPPED));
  }

  const department = await context.organisationalUnitService.findByCode("CSE");
  assert.equal(department?.parent?.code, "FOE");
  const hod = await context.designationService.findByCode("head_of_department");
  assert.deepEqual(hod?.applicableUnitTypes, [OrganisationalUnitType.DEPARTMENT]);

  const headOfComputerScience = (await context.userService.listUsers({
    search: "u4@u.c",
    organisationalUnitId: null,
    limit: 1,
    offset: 0,
  })).users[0]!;
  const affiliations = await context.userAffiliationService.getForUser(headOfComputerScience.id);
  assert.deepEqual(
    affiliations.memberships.map((membership) => [
      membership.organisationalUnit.code,
      membership.designations.map((designation) => designation.code),
    ]),
    [
      ["FOE", []],
      ["CSE", ["head_of_department", "senior_lecturer_grade_i"]],
    ],
  );
  assert.deepEqual(
    affiliations.effectiveFaculties.map((faculty) => faculty.code),
    ["FOE"],
  );
});
