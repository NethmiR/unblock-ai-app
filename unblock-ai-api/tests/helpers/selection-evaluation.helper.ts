import { evaluateCandidateEligibility } from "../../src/utils/selection/candidate-eligibility.util.js";
import { loadExpectedFixture } from "./fixture.helper.js";
import type { OrganisationCatalogue } from "../../src/lib/types/organisation/organisation-catalogue.type.js";
import type { RequesterProfile } from "../../src/lib/types/requester/requester.type.js";
import type { BoostedCandidate, SelectorCandidate } from "../../src/lib/types/selection/candidate.type.js";

export interface SelectionEvaluationCase {
  query: string;
  requester: string;
  expect: string;
  expect_workflow?: string;
  expect_in_candidates?: string[];
  note?: string;
}

export function eligibleFixtureCandidates(
  retrieved: readonly BoostedCandidate[],
  profile: RequesterProfile,
  catalogue: OrganisationCatalogue,
): SelectorCandidate[] {
  return retrieved.flatMap((candidate) => {
    if (candidate.retrieval_summary === null) return [];
    const appliesTo = loadExpectedFixture(`${candidate.workflow_template_id}.json`).scope.applies_to;
    const audience = { actorType: appliesTo.actor_type, organisationalUnitCodes: appliesTo.organisational_unit_codes };
    if (!evaluateCandidateEligibility(audience, profile, catalogue).eligible) return [];
    return [
      {
        workflow_template_id: candidate.workflow_template_id,
        title: candidate.title,
        retrieval_summary: candidate.retrieval_summary,
        audience_unit_names: audience.organisationalUnitCodes.map((code) => catalogue.unitsByCode.get(code)?.name ?? code),
      },
    ];
  });
}
