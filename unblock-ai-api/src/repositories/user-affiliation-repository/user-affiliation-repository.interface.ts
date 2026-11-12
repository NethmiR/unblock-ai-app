import type {
  OrganisationalUnitMemberRecord,
  OrganisationalUnitReference,
} from "../../lib/types/organisational-unit/organisational-unit.type.js";
import type {
  DesignationAssignmentKey,
  DesignationHolderRecord,
  MembershipInput,
  UserMembershipRecord,
} from "../../lib/types/user-affiliation/user-affiliation.type.js";

export interface IUserAffiliationRepository {
  findMembershipsByUserId(userId: string): Promise<UserMembershipRecord[]>;
  findUnitSummariesByUserIds(userIds: readonly string[]): Promise<Map<string, OrganisationalUnitReference[]>>;
  findMembersByUnitId(organisationalUnitId: string): Promise<OrganisationalUnitMemberRecord[]>;
  findSingleHolders(keys: readonly DesignationAssignmentKey[]): Promise<DesignationHolderRecord[]>;
  replaceForUser(userId: string, memberships: readonly MembershipInput[], actorUserId: string | null): Promise<void>;
}
