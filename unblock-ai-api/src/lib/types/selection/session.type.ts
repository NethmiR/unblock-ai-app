import type { ObjectId } from "mongodb";
import type { RetrievalSummary } from "../workflow/retrieval-summary.type.js";

export type SessionOutcome = "matched" | "abandoned" | "no_match";

export interface SessionCandidate {
  workflow_template_id: string;
  workflow_template_version: number;
  title: string;
  score: number;
  base_score: number;
  alias_hits: string[];
  retrieval_summary: RetrievalSummary | null;
}

export interface SessionRound {
  question: string;
  options: string[];
  answer: string | null;
  asked_at: Date;
  answered_at: Date | null;
}

export interface SelectionSessionDocument {
  _id: ObjectId;
  user_query: string;
  candidates: SessionCandidate[];
  rounds: SessionRound[];
  outcome: SessionOutcome | null;
  selected_workflow_template_id: string | null;
  requester_context: unknown | null;
  created_at: Date;
  updated_at: Date;
}

export interface SelectionResponseCandidate {
  workflow_template_id: string;
  title: string;
  one_liner: string | null;
  score: number;
}

export interface SelectionResponseDto {
  session_id: string;
  decision: string;
  workflow_template_id: string | null;
  confidence: string;
  question: string | null;
  options: string[];
  candidates: SelectionResponseCandidate[];
}
