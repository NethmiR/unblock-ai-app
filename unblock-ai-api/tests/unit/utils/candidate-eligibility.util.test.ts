import test from "node:test";
import assert from "node:assert/strict";
import { SelectionTraceStep } from "../../../src/data/constants/selection.constant.js";
import { evaluateCandidateEligibility } from "../../../src/utils/selection/candidate-eligibility.util.js";
import { buildOrganisationCatalogue, sampleRequesterProfile } from "../../helpers/organisation-catalogue.helper.js";

const catalogue = buildOrganisationCatalogue();

test("a department member matches an audience faculty through the department's parent", () => {
  const profile = sampleRequesterProfile("Ishara Bandara", catalogue);

  const result = evaluateCandidateEligibility({ actorType: "any", organisationalUnitCodes: ["FIT"] }, profile, catalogue);

  assert.deepEqual(result, { eligible: true, matchedFactIds: ["P1", "P2", "P3"] });
});

test("a faculty-only member does not match an audience department", () => {
  const profile = sampleRequesterProfile("Ruwan Jayasekara", catalogue);

  const result = evaluateCandidateEligibility({ actorType: "any", organisationalUnitCodes: ["CSE"] }, profile, catalogue);

  assert.deepEqual(result, { eligible: false, exclusion: SelectionTraceStep.EXCLUDED_BY_AUDIENCE });
});

test("an empty audience with actor type any is open to everyone", () => {
  const profile = sampleRequesterProfile("Oshadi Liyanage", catalogue);

  const result = evaluateCandidateEligibility({ actorType: "any", organisationalUnitCodes: [] }, profile, catalogue);

  assert.deepEqual(result, { eligible: true, matchedFactIds: [] });
});

test("a requester type mismatch excludes the candidate", () => {
  const profile = sampleRequesterProfile("Hasitha Dissanayake", catalogue);

  const result = evaluateCandidateEligibility({ actorType: "staff", organisationalUnitCodes: [] }, profile, catalogue);

  assert.deepEqual(result, { eligible: false, exclusion: SelectionTraceStep.EXCLUDED_BY_REQUESTER_TYPE });
});

test("unknown requester actor types skip the requester-type filter", () => {
  const profile = sampleRequesterProfile("Lahiru Ekanayake", catalogue);

  const result = evaluateCandidateEligibility({ actorType: "student", organisationalUnitCodes: [] }, profile, catalogue);

  assert.deepEqual(result, { eligible: true, matchedFactIds: [] });
});

test("an unknown audience code never matches", () => {
  const profile = sampleRequesterProfile("Ishara Bandara", catalogue);

  const result = evaluateCandidateEligibility({ actorType: "any", organisationalUnitCodes: ["NOPE"] }, profile, catalogue);

  assert.deepEqual(result, { eligible: false, exclusion: SelectionTraceStep.EXCLUDED_BY_AUDIENCE });
});
