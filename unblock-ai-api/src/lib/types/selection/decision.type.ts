import type { Confidence } from "../workflow/workflow.type.js";

export type SelectionDecisionKind = "matched" | "ambiguous" | "no_match" | "manual_choice";

export interface SelectorDecision {
  decision: Exclude<SelectionDecisionKind, "manual_choice">;
  workflow_id: string | null;
  confidence: Confidence;
  question: string | null;
  options: string[];
  reasoning: string;
}

export interface AppliedDecision {
  decision: SelectionDecisionKind;
  workflow_id: string | null;
  confidence: Confidence;
  question: string | null;
  options: string[];
  reasoning: string;
}
