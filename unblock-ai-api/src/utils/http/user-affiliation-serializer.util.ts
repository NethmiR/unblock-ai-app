import { serializeDesignationReference } from "./designation-serializer.util.js";
import {
  serializeOrganisationalUnit,
  serializeOrganisationalUnitReference,
} from "./organisational-unit-serializer.util.js";
import type {
  UserAffiliationsDto,
  UserAffiliationsRecord,
  UserMembershipDto,
  UserMembershipRecord,
} from "../../lib/types/user-affiliation/user-affiliation.type.js";

export function serializeUserMembership(membership: UserMembershipRecord): UserMembershipDto {
  return {
    organisational_unit: serializeOrganisationalUnit(membership.organisationalUnit),
    designations: membership.designations.map(serializeDesignationReference),
    assigned_at: membership.assignedAt.toISOString(),
  };
}

export function serializeUserAffiliations(affiliations: UserAffiliationsRecord): UserAffiliationsDto {
  return {
    memberships: affiliations.memberships.map(serializeUserMembership),
    effective_faculties: affiliations.effectiveFaculties.map(serializeOrganisationalUnitReference),
  };
}
