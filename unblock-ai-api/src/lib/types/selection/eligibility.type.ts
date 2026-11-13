import type { SelectionTraceStep } from "../../../data/constants/selection.constant.js";
import type { ActorType } from "../workflow/workflow.type.js";

export interface WorkflowTemplateAudience {
  actorType: ActorType;
  organisationalUnitCodes: string[];
}

export type CandidateExclusion = SelectionTraceStep.EXCLUDED_BY_AUDIENCE | SelectionTraceStep.EXCLUDED_BY_REQUESTER_TYPE;

export type CandidateEligibility =
  | { eligible: true; matchedFactIds: string[] }
  | { eligible: false; exclusion: CandidateExclusion };
