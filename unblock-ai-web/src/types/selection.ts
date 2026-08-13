export type SelectionDecision = "matched" | "ambiguous" | "no_match" | "manual_choice";

export type Confidence = "high" | "medium" | "low";

export interface SelectionCandidate {
  workflow_id: string;
  title: string;
  one_liner: string | null;
  score: number;
}

export interface SelectionResponse {
  session_id: string;
  decision: SelectionDecision;
  workflow_id: string | null;
  confidence: Confidence;
  question: string | null;
  options: string[];
  candidates: SelectionCandidate[];
}

export interface ChooseResponse {
  session_id: string;
  decision: SelectionDecision;
  workflow_id: string;
}
