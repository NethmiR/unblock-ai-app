import type { SELECTOR_DECISION_KINDS } from "../../../data/constants/selection.constant.js";
import type { Confidence } from "../workflow/workflow.type.js";

export type SelectorDecisionKind = (typeof SELECTOR_DECISION_KINDS)[number];

export interface SelectorDecision {
  decision: SelectorDecisionKind;
  workflow_template_id: string | null;
  confidence: Confidence;
  question: string | null;
  options: string[];
  matched_fact_ids: string[];
  reasoning: string;
}
