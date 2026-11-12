import { UserAffiliationIssueCode } from "../data/constants/user-affiliation-error.constant.js";
import { organisationalUnitNotFound } from "../errors/organisational-unit.error.js";
import { userNotFound } from "../errors/user.error.js";
import { designationHolderConflict, UserAffiliationValidationError } from "../errors/user-affiliation.error.js";
import { createAffiliationIssue, findStructuralIssues } from "../utils/user-affiliation/membership-input.util.js";
import { resolveEffectiveFaculties } from "../utils/user-affiliation/effective-faculty.util.js";
import { isMissingFacultyMembership } from "../utils/user-affiliation/faculty-membership.util.js";
import { toAssignmentKey } from "../utils/user-affiliation/assignment-key.util.js";
import { uniqueValues } from "../utils/shared/collection.util.js";
import type { IUserAffiliationRepository } from "../repositories/user-affiliation-repository/user-affiliation-repository.interface.js";
import type { IOrganisationalUnitRepository } from "../repositories/organisational-unit-repository/organisational-unit-repository.interface.js";
import type { IDesignationRepository } from "../repositories/designation-repository/designation-repository.interface.js";
import type { IUserRepository } from "../repositories/user-repository/user-repository.interface.js";
import type { DesignationRecord } from "../lib/types/designation/designation.type.js";
import type {
  OrganisationalUnitMemberRecord,
  OrganisationalUnitRecord,
} from "../lib/types/organisational-unit/organisational-unit.type.js";
import type {
  DesignationAssignmentKey,
  MembershipInput,
  ReplaceUserAffiliationsInput,
  UserAffiliationIssue,
  UserAffiliationsRecord,
  UserMembershipRecord,
} from "../lib/types/user-affiliation/user-affiliation.type.js";

export interface UserAffiliationServiceOptions {
  userAffiliationRepository: IUserAffiliationRepository;
  organisationalUnitRepository: IOrganisationalUnitRepository;
  designationRepository: IDesignationRepository;
  userRepository: IUserRepository;
}

interface AffiliationReferenceData {
  unitsById: Map<string, OrganisationalUnitRecord>;
  requestedUnitIds: Set<string>;
  designationsById: Map<string, DesignationRecord>;
  currentUnitIds: Set<string>;
  currentAssignmentKeys: Set<string>;
}

export class UserAffiliationService {
  private readonly userAffiliationRepository: IUserAffiliationRepository;
  private readonly organisationalUnitRepository: IOrganisationalUnitRepository;
  private readonly designationRepository: IDesignationRepository;
  private readonly userRepository: IUserRepository;

  constructor({
    userAffiliationRepository,
    organisationalUnitRepository,
    designationRepository,
    userRepository,
  }: UserAffiliationServiceOptions) {
    this.userAffiliationRepository = userAffiliationRepository;
    this.organisationalUnitRepository = organisationalUnitRepository;
    this.designationRepository = designationRepository;
    this.userRepository = userRepository;
  }

  async getForUser(userId: string): Promise<UserAffiliationsRecord> {
    await this.assertUserExists(userId);
    return this.readAffiliations(userId);
  }

  async replaceForUser(
    userId: string,
    input: ReplaceUserAffiliationsInput,
    actorUserId: string | null,
  ): Promise<UserAffiliationsRecord> {
    const structuralIssues = findStructuralIssues(input.memberships);
    if (structuralIssues.length > 0) throw new UserAffiliationValidationError(structuralIssues);

    await this.assertUserExists(userId);
    const referenceData = await this.loadReferenceData(userId, input.memberships);
    const ruleIssues = input.memberships.flatMap((membership) => findMembershipIssues(membership, referenceData));
    if (ruleIssues.length > 0) throw new UserAffiliationValidationError(ruleIssues);

    await this.assertSingleHoldersAvailable(userId, input.memberships, referenceData.designationsById);
    await this.userAffiliationRepository.replaceForUser(userId, input.memberships, actorUserId);
    return this.readAffiliations(userId);
  }

  async listUnitMembers(organisationalUnitId: string): Promise<OrganisationalUnitMemberRecord[]> {
    const unit = await this.organisationalUnitRepository.findById(organisationalUnitId);
    if (!unit) throw organisationalUnitNotFound(organisationalUnitId);
    return this.userAffiliationRepository.findMembersByUnitId(organisationalUnitId);
  }

  private async readAffiliations(userId: string): Promise<UserAffiliationsRecord> {
    const memberships = await this.userAffiliationRepository.findMembershipsByUserId(userId);
    return {
      memberships,
      effectiveFaculties: resolveEffectiveFaculties(memberships.map((membership) => membership.organisationalUnit)),
    };
  }

  private async assertUserExists(userId: string): Promise<void> {
    if (!(await this.userRepository.findById(userId))) throw userNotFound(userId);
  }

  private async loadReferenceData(
    userId: string,
    memberships: readonly MembershipInput[],
  ): Promise<AffiliationReferenceData> {
    const unitIds = uniqueValues(memberships.map((membership) => membership.organisationalUnitId));
    const designationIds = uniqueValues(memberships.flatMap((membership) => membership.designationIds));
    const [units, designations, current] = await Promise.all([
      this.organisationalUnitRepository.findByIds(unitIds),
      this.designationRepository.findByIds(designationIds),
      this.userAffiliationRepository.findMembershipsByUserId(userId),
    ]);

    return {
      unitsById: new Map(units.map((unit) => [unit.id, unit])),
      requestedUnitIds: new Set(unitIds),
      designationsById: new Map(designations.map((designation) => [designation.id, designation])),
      currentUnitIds: new Set(current.map((membership) => membership.organisationalUnit.id)),
      currentAssignmentKeys: new Set(current.flatMap(toCurrentAssignmentKeys)),
    };
  }

  private async assertSingleHoldersAvailable(
    userId: string,
    memberships: readonly MembershipInput[],
    designationsById: ReadonlyMap<string, DesignationRecord>,
  ): Promise<void> {
    const singleHolderKeys: DesignationAssignmentKey[] = memberships.flatMap((membership) =>
      membership.designationIds
        .filter((designationId) => designationsById.get(designationId)?.singleHolderPerUnit === true)
        .map((designationId) => ({ designationId, organisationalUnitId: membership.organisationalUnitId })),
    );
    const conflicts = (await this.userAffiliationRepository.findSingleHolders(singleHolderKeys)).filter(
      (holder) => holder.holder.id !== userId,
    );
    if (conflicts.length > 0) throw designationHolderConflict(conflicts);
  }
}

function toCurrentAssignmentKeys(membership: UserMembershipRecord): string[] {
  return membership.designations.map((designation) =>
    toAssignmentKey({ designationId: designation.id, organisationalUnitId: membership.organisationalUnit.id }),
  );
}

function findMembershipIssues(membership: MembershipInput, referenceData: AffiliationReferenceData): UserAffiliationIssue[] {
  const unitId = membership.organisationalUnitId;
  const unit = referenceData.unitsById.get(unitId);
  if (!unit) return [createAffiliationIssue(UserAffiliationIssueCode.ORGANISATIONAL_UNIT_NOT_FOUND, unitId)];

  const issues: UserAffiliationIssue[] = [];
  if (unit.isArchived && !referenceData.currentUnitIds.has(unitId)) {
    issues.push(createAffiliationIssue(UserAffiliationIssueCode.ORGANISATIONAL_UNIT_ARCHIVED, unitId));
  }
  if (isMissingFacultyMembership(unit, referenceData.requestedUnitIds)) {
    issues.push(createAffiliationIssue(UserAffiliationIssueCode.FACULTY_MEMBERSHIP_REQUIRED, unitId));
  }

  for (const designationId of membership.designationIds) {
    const designation = referenceData.designationsById.get(designationId);
    const isCurrent = referenceData.currentAssignmentKeys.has(toAssignmentKey({ designationId, organisationalUnitId: unitId }));
    if (!designation) {
      issues.push(createAffiliationIssue(UserAffiliationIssueCode.DESIGNATION_NOT_FOUND, unitId, designationId));
    } else if (!designation.applicableUnitTypes.includes(unit.unitType)) {
      issues.push(createAffiliationIssue(UserAffiliationIssueCode.DESIGNATION_NOT_APPLICABLE, unitId, designationId));
    } else if (designation.isArchived && !isCurrent) {
      issues.push(createAffiliationIssue(UserAffiliationIssueCode.DESIGNATION_ARCHIVED, unitId, designationId));
    }
  }
  return issues;
}
