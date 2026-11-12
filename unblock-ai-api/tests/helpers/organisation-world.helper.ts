import { createInMemoryRepositoryRegistry, type InMemoryRepositoryRegistry } from "../../src/repositories/repository-registry.factory.js";
import { OrganisationalUnitType } from "../../src/data/constants/organisational-unit.constant.js";
import { DesignationCategory } from "../../src/data/constants/designation.constant.js";
import { Permission } from "../../src/data/constants/permission.constant.js";
import type { OrganisationalUnitSummaryRecord } from "../../src/lib/types/organisational-unit/organisational-unit.type.js";
import type { DesignationSummaryRecord } from "../../src/lib/types/designation/designation.type.js";
import type { UserRecord } from "../../src/lib/types/user/user.type.js";
import type { MembershipInput } from "../../src/lib/types/user-affiliation/user-affiliation.type.js";

export interface OrganisationWorld {
  repositories: InMemoryRepositoryRegistry;
  engineering: OrganisationalUnitSummaryRecord;
  computerScience: OrganisationalUnitSummaryRecord;
  examinations: OrganisationalUnitSummaryRecord;
  dean: DesignationSummaryRecord;
  headOfDepartment: DesignationSummaryRecord;
  lecturer: DesignationSummaryRecord;
  director: DesignationSummaryRecord;
  administrator: UserRecord;
  firstStaffMember: UserRecord;
  secondStaffMember: UserRecord;
}

export function membershipsFor(world: OrganisationWorld, unitId: string, designationIds: string[] = []): MembershipInput[] {
  const membership = { organisationalUnitId: unitId, designationIds };
  return unitId === world.computerScience.id
    ? [{ organisationalUnitId: world.engineering.id, designationIds: [] }, membership]
    : [membership];
}

export async function createOrganisationWorld(
  repositories: InMemoryRepositoryRegistry = createInMemoryRepositoryRegistry(),
): Promise<OrganisationWorld> {
  const { organisationalUnitRepository, designationRepository, userRepository } = repositories;

  const engineering = await organisationalUnitRepository.create({
    code: "FOE",
    name: "Faculty of Engineering",
    unitType: OrganisationalUnitType.FACULTY,
    parent: null,
    description: null,
    createdByUserId: null,
  });
  const computerScience = await organisationalUnitRepository.create({
    code: "CSE",
    name: "Department of Computer Science & Engineering",
    unitType: OrganisationalUnitType.DEPARTMENT,
    parent: { id: engineering.id, unitType: engineering.unitType },
    description: null,
    createdByUserId: null,
  });
  const examinations = await organisationalUnitRepository.create({
    code: "EXAM",
    name: "Examinations & Registration Division",
    unitType: OrganisationalUnitType.DIVISION,
    parent: null,
    description: null,
    createdByUserId: null,
  });

  const dean = await designationRepository.create({
    code: "dean",
    title: "Dean",
    category: DesignationCategory.LEADERSHIP,
    applicableUnitTypes: [OrganisationalUnitType.FACULTY],
    singleHolderPerUnit: true,
    displayOrder: 60,
    createdByUserId: null,
  });
  const headOfDepartment = await designationRepository.create({
    code: "head_of_department",
    title: "Head of Department",
    category: DesignationCategory.LEADERSHIP,
    applicableUnitTypes: [OrganisationalUnitType.DEPARTMENT],
    singleHolderPerUnit: true,
    displayOrder: 70,
    createdByUserId: null,
  });
  const lecturer = await designationRepository.create({
    code: "lecturer",
    title: "Lecturer",
    category: DesignationCategory.ACADEMIC,
    applicableUnitTypes: [OrganisationalUnitType.FACULTY, OrganisationalUnitType.DEPARTMENT],
    singleHolderPerUnit: false,
    displayOrder: 150,
    createdByUserId: null,
  });
  const director = await designationRepository.create({
    code: "director",
    title: "Director",
    category: DesignationCategory.LEADERSHIP,
    applicableUnitTypes: [OrganisationalUnitType.DIVISION],
    singleHolderPerUnit: true,
    displayOrder: 80,
    createdByUserId: null,
  });

  const createStaff = (email: string, fullName: string, permissions: Permission[]): Promise<UserRecord> =>
    userRepository.create({ email, fullName, passwordHash: "unused", permissions, createdByUserId: null });

  return {
    repositories,
    engineering,
    computerScience,
    examinations,
    dean,
    headOfDepartment,
    lecturer,
    director,
    administrator: await createStaff("administrator@uom.lk", "Administrator", [Permission.USER_MANAGE]),
    firstStaffMember: await createStaff("amara@uom.lk", "Amara Perera", [Permission.TASK_CREATE]),
    secondStaffMember: await createStaff("bandara@uom.lk", "Bandara Silva", [Permission.TASK_CREATE]),
  };
}
