import { UNFILTERED_SCOPE_ACTOR_TYPES } from "../../data/constants/requester.constant.js";
import { SelectionTraceStep } from "../../data/constants/selection.constant.js";
import type { OrganisationCatalogue } from "../../lib/types/organisation/organisation-catalogue.type.js";
import type { RequesterProfile } from "../../lib/types/requester/requester.type.js";
import type { CandidateEligibility, WorkflowTemplateAudience } from "../../lib/types/selection/eligibility.type.js";
import type { OrganisationalUnitReference } from "../../lib/types/organisational-unit/organisational-unit.type.js";

export function audienceUnitIds(audience: WorkflowTemplateAudience, catalogue: OrganisationCatalogue): Set<string> {
  const ids = new Set<string>();
  for (const code of audience.organisationalUnitCodes) {
    const unit = catalogue.unitsByCode.get(code);
    if (unit) ids.add(unit.id);
  }
  return ids;
}

export function isUnitInAudience(
  unit: OrganisationalUnitReference,
  parent: OrganisationalUnitReference | null,
  audienceIds: ReadonlySet<string>,
): boolean {
  return audienceIds.has(unit.id) || (parent !== null && audienceIds.has(parent.id));
}

function isRequesterTypeAllowed(audience: WorkflowTemplateAudience, profile: RequesterProfile): boolean {
  if (UNFILTERED_SCOPE_ACTOR_TYPES.includes(audience.actorType)) return true;
  if (profile.actorTypes.length === 0) return true;
  return profile.actorTypes.includes(audience.actorType);
}

export function evaluateCandidateEligibility(
  audience: WorkflowTemplateAudience,
  profile: RequesterProfile,
  catalogue: OrganisationCatalogue,
): CandidateEligibility {
  let matchedFactIds: string[] = [];
  if (audience.organisationalUnitCodes.length > 0) {
    const audienceIds = audienceUnitIds(audience, catalogue);
    matchedFactIds = profile.facts
      .filter((fact) => isUnitInAudience(fact.unit, fact.parent, audienceIds))
      .map((fact) => fact.id);
    if (matchedFactIds.length === 0) return { eligible: false, exclusion: SelectionTraceStep.EXCLUDED_BY_AUDIENCE };
  }
  if (!isRequesterTypeAllowed(audience, profile)) {
    return { eligible: false, exclusion: SelectionTraceStep.EXCLUDED_BY_REQUESTER_TYPE };
  }
  return { eligible: true, matchedFactIds };
}
