import {
  REQUESTER_ACTOR_TYPES_BY_DESIGNATION_CATEGORY,
  REQUESTER_PROFILE_FACT_ID_PREFIX,
  RequesterProfileFactKind,
} from "../../data/constants/requester.constant.js";
import { resolveEffectiveFaculties } from "../user-affiliation/effective-faculty.util.js";
import { toOrganisationalUnitReference } from "../organisation/organisational-unit-reference.util.js";
import type { RequesterProfile, RequesterProfileFact, RequesterUnit } from "../../lib/types/requester/requester.type.js";
import type { UserRecord } from "../../lib/types/user/user.type.js";
import type { UserMembershipRecord } from "../../lib/types/user-affiliation/user-affiliation.type.js";
import type { ActorType } from "../../lib/types/workflow/workflow.type.js";

function toRequesterUnit(membership: UserMembershipRecord): RequesterUnit {
  const { organisationalUnit } = membership;
  return {
    unit: toOrganisationalUnitReference(organisationalUnit),
    parent: organisationalUnit.parent ? toOrganisationalUnitReference(organisationalUnit.parent) : null,
    designations: [...membership.designations],
  };
}

function buildFacts(units: readonly RequesterUnit[]): RequesterProfileFact[] {
  const facts: Omit<RequesterProfileFact, "id">[] = [];
  for (const { unit, parent, designations } of units) {
    facts.push({ kind: RequesterProfileFactKind.MEMBER_OF_UNIT, unit, parent, designation: null });
    for (const designation of designations) {
      facts.push({ kind: RequesterProfileFactKind.HOLDS_DESIGNATION, unit, parent, designation });
    }
  }
  return facts.map((fact, index) => ({ id: `${REQUESTER_PROFILE_FACT_ID_PREFIX}${index + 1}`, ...fact }));
}

function deriveActorTypes(units: readonly RequesterUnit[]): ActorType[] {
  const actorTypes = new Set<ActorType>();
  for (const { designations } of units) {
    for (const designation of designations) {
      for (const actorType of REQUESTER_ACTOR_TYPES_BY_DESIGNATION_CATEGORY[designation.category]) {
        actorTypes.add(actorType);
      }
    }
  }
  return [...actorTypes];
}

export function buildRequesterProfile(user: UserRecord, memberships: readonly UserMembershipRecord[]): RequesterProfile {
  const units = memberships.map(toRequesterUnit);
  return {
    userId: user.id,
    fullName: user.fullName,
    email: user.email,
    units,
    effectiveFaculties: resolveEffectiveFaculties(memberships.map((membership) => membership.organisationalUnit)),
    actorTypes: deriveActorTypes(units),
    facts: buildFacts(units),
  };
}
