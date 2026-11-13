import { DatabaseError } from "../../errors/database.error.js";
import { designationHolderConflict, facultyMembershipRequired } from "../../errors/user-affiliation.error.js";
import { isMissingFacultyMembership } from "../../utils/user-affiliation/faculty-membership.util.js";
import { compareDesignations } from "../../utils/organisation/designation-reference.util.js";
import { toOrganisationalUnitReference } from "../../utils/organisation/organisational-unit-reference.util.js";
import { compareMemberships, compareOrganisationalUnits } from "../../utils/user-affiliation/membership-order.util.js";
import { compareText } from "../../utils/shared/text.util.js";
import { UserStatus } from "../../data/constants/user.constant.js";
import type { InMemoryOrganisationStore, StoredDesignationAssignment } from "../in-memory-organisation-store.js";
import type { IUserRepository } from "../user-repository/user-repository.interface.js";
import type { IUserAffiliationRepository } from "./user-affiliation-repository.interface.js";
import type { DesignationReference } from "../../lib/types/designation/designation.type.js";
import type {
  OrganisationalUnitMemberRecord,
  OrganisationalUnitReference,
} from "../../lib/types/organisational-unit/organisational-unit.type.js";
import type {
  DesignationAssignmentKey,
  DesignationHolderRecord,
  MembershipInput,
  UserDesignationAssignmentKey,
  UserMembershipRecord,
} from "../../lib/types/user-affiliation/user-affiliation.type.js";

export interface InMemoryUserAffiliationRepositoryOptions {
  store: InMemoryOrganisationStore;
  userRepository: IUserRepository;
}

function isSameAssignment(a: UserDesignationAssignmentKey, b: UserDesignationAssignmentKey): boolean {
  return a.userId === b.userId && a.designationId === b.designationId && a.organisationalUnitId === b.organisationalUnitId;
}

export class InMemoryUserAffiliationRepository implements IUserAffiliationRepository {
  private readonly store: InMemoryOrganisationStore;
  private readonly userRepository: IUserRepository;

  constructor({ store, userRepository }: InMemoryUserAffiliationRepositoryOptions) {
    this.store = store;
    this.userRepository = userRepository;
  }

  async findMembershipsByUserId(userId: string): Promise<UserMembershipRecord[]> {
    return this.store
      .membershipsOfUser(userId)
      .flatMap((membership) => {
        const unit = this.store.units.get(membership.organisationalUnitId);
        if (!unit) return [];
        return [
          {
            organisationalUnit: this.store.toUnitRecord(unit),
            designations: this.designationsOf(
              this.store.assignments.filter(
                (assignment) => assignment.userId === userId && assignment.organisationalUnitId === unit.id,
              ),
            ),
            assignedAt: membership.assignedAt,
          },
        ];
      })
      .sort(compareMemberships);
  }

  async findUnitSummariesByUserIds(userIds: readonly string[]): Promise<Map<string, OrganisationalUnitReference[]>> {
    return new Map(
      userIds.map((userId) => [
        userId,
        this.store
          .membershipsOfUser(userId)
          .flatMap((membership) => {
            const unit = this.store.units.get(membership.organisationalUnitId);
            return unit ? [this.store.toUnitRecord(unit)] : [];
          })
          .sort(compareOrganisationalUnits)
          .map(toOrganisationalUnitReference),
      ]),
    );
  }

  async findMembersByUnitId(organisationalUnitId: string): Promise<OrganisationalUnitMemberRecord[]> {
    const members: OrganisationalUnitMemberRecord[] = [];
    for (const membership of this.store.membershipsOfUnit(organisationalUnitId)) {
      const user = await this.userRepository.findById(membership.userId);
      if (!user) continue;
      members.push({
        user: { id: user.id, fullName: user.fullName, email: user.email },
        designations: this.designationsOf(
          this.store.assignments.filter(
            (assignment) => assignment.userId === user.id && assignment.organisationalUnitId === organisationalUnitId,
          ),
        ),
        assignedAt: membership.assignedAt,
      });
    }
    return members.sort(
      (a, b) => compareText(a.user.fullName, b.user.fullName) || a.user.id.localeCompare(b.user.id),
    );
  }

  async findSingleHolders(keys: readonly DesignationAssignmentKey[]): Promise<DesignationHolderRecord[]> {
    const holders: DesignationHolderRecord[] = [];
    for (const assignment of this.store.assignments) {
      const designation = this.store.designations.get(assignment.designationId);
      const requested = keys.some(
        (key) => key.designationId === assignment.designationId && key.organisationalUnitId === assignment.organisationalUnitId,
      );
      if (!requested || !designation?.singleHolderPerUnit) continue;
      const user = await this.userRepository.findById(assignment.userId);
      if (!user) continue;
      holders.push({
        designationId: assignment.designationId,
        organisationalUnitId: assignment.organisationalUnitId,
        holder: { id: user.id, fullName: user.fullName, email: user.email },
      });
    }
    return holders;
  }

  async findDesignationHolders(
    designationId: string,
    organisationalUnitIds: readonly string[] | null,
  ): Promise<DesignationHolderRecord[]> {
    const unitFilter = organisationalUnitIds === null ? null : new Set(organisationalUnitIds);
    const holders: DesignationHolderRecord[] = [];
    for (const assignment of this.store.assignments) {
      if (assignment.designationId !== designationId) continue;
      if (unitFilter !== null && !unitFilter.has(assignment.organisationalUnitId)) continue;
      const user = await this.userRepository.findById(assignment.userId);
      if (!user || user.status !== UserStatus.ACTIVE) continue;
      holders.push({
        designationId: assignment.designationId,
        organisationalUnitId: assignment.organisationalUnitId,
        holder: { id: user.id, fullName: user.fullName, email: user.email },
      });
    }
    return holders.sort(
      (a, b) =>
        compareText(a.holder.fullName, b.holder.fullName)
        || a.holder.id.localeCompare(b.holder.id)
        || a.organisationalUnitId.localeCompare(b.organisationalUnitId),
    );
  }

  async replaceForUser(userId: string, memberships: readonly MembershipInput[], actorUserId: string | null): Promise<void> {
    const desiredAssignments = memberships.flatMap((membership) =>
      membership.designationIds.map((designationId) => ({
        userId,
        designationId,
        organisationalUnitId: membership.organisationalUnitId,
      })),
    );
    this.assertReferentialIntegrity(memberships, desiredAssignments);
    this.assertDepartmentFaculties(memberships);
    this.assertSingleHolders(desiredAssignments);

    const now = new Date();
    const desiredUnitIds = new Set(memberships.map((membership) => membership.organisationalUnitId));
    const retainedMemberships = this.store.memberships.filter(
      (membership) => membership.userId !== userId || desiredUnitIds.has(membership.organisationalUnitId),
    );
    const existingUnitIds = new Set(this.store.membershipsOfUser(userId).map((membership) => membership.organisationalUnitId));
    const addedMemberships = [...desiredUnitIds]
      .filter((unitId) => !existingUnitIds.has(unitId))
      .map((organisationalUnitId) => ({ userId, organisationalUnitId, assignedByUserId: actorUserId, assignedAt: now }));

    const retainedAssignments = this.store.assignments.filter(
      (assignment) => assignment.userId !== userId || desiredAssignments.some((desired) => isSameAssignment(desired, assignment)),
    );
    const addedAssignments: StoredDesignationAssignment[] = desiredAssignments
      .filter((desired) => !retainedAssignments.some((assignment) => isSameAssignment(desired, assignment)))
      .map((desired) => ({ ...desired, assignedByUserId: actorUserId, assignedAt: now }));

    this.store.memberships = [...retainedMemberships, ...addedMemberships];
    this.store.assignments = [...retainedAssignments, ...addedAssignments];
  }

  private designationsOf(assignments: readonly StoredDesignationAssignment[]): DesignationReference[] {
    return assignments
      .flatMap((assignment) => {
        const designation = this.store.designations.get(assignment.designationId);
        return designation ? [this.store.toDesignationReference(designation)] : [];
      })
      .sort(compareDesignations);
  }

  private assertDepartmentFaculties(memberships: readonly MembershipInput[]): void {
    const memberUnitIds = new Set(memberships.map((membership) => membership.organisationalUnitId));
    const departmentsMissingFaculty = memberships.flatMap((membership) => {
      const unit = this.store.units.get(membership.organisationalUnitId);
      return unit && isMissingFacultyMembership(this.store.toUnitRecord(unit), memberUnitIds) ? [unit.id] : [];
    });
    if (departmentsMissingFaculty.length > 0) throw facultyMembershipRequired(departmentsMissingFaculty);
  }

  private assertReferentialIntegrity(
    memberships: readonly MembershipInput[],
    assignments: readonly UserDesignationAssignmentKey[],
  ): void {
    for (const membership of memberships) {
      if (!this.store.units.has(membership.organisationalUnitId)) {
        throw new DatabaseError(`Organisational unit '${membership.organisationalUnitId}' does not exist`);
      }
    }
    for (const assignment of assignments) {
      const designation = this.store.designations.get(assignment.designationId);
      const unit = this.store.units.get(assignment.organisationalUnitId);
      if (!designation || !unit || !designation.applicableUnitTypes.includes(unit.unitType)) {
        throw new DatabaseError(`Designation '${assignment.designationId}' cannot be held in '${assignment.organisationalUnitId}'`);
      }
    }
  }

  private assertSingleHolders(assignments: readonly UserDesignationAssignmentKey[]): void {
    const conflicting = assignments.some(
      (desired) =>
        this.store.designations.get(desired.designationId)?.singleHolderPerUnit === true &&
        this.store.assignments.some(
          (existing) =>
            existing.userId !== desired.userId &&
            existing.designationId === desired.designationId &&
            existing.organisationalUnitId === desired.organisationalUnitId,
        ),
    );
    if (conflicting) throw designationHolderConflict();
  }
}
