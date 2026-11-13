import type { ObjectId } from "mongodb";
import type {
  SelectionDecisionKind,
  SelectionMessageRole,
  SelectionSessionStatus,
  SelectionTraceStep,
} from "../../../data/constants/selection.constant.js";
import type { RetrievalSummary } from "../workflow/retrieval-summary.type.js";
import type { ActorType } from "../workflow/workflow.type.js";

export interface SelectionOption {
  id: string;
  label: string;
  workflow_template_id: string | null;
}

export interface SelectionTraceEntry {
  step: SelectionTraceStep;
  count: number;
  workflow_template_titles: string[];
}

export interface RequesterSelectionMessage {
  id: string;
  role: SelectionMessageRole.REQUESTER;
  text: string;
  sent_at: Date;
}

export interface AssistantSelectionMessage {
  id: string;
  role: SelectionMessageRole.ASSISTANT;
  decision: SelectionDecisionKind;
  workflow_template_id: string | null;
  question: string | null;
  options: SelectionOption[];
  matched_fact_ids: string[];
  trace: SelectionTraceEntry[];
  sent_at: Date;
}

export type SelectionMessage = RequesterSelectionMessage | AssistantSelectionMessage;

export interface SessionCandidateAudience {
  actor_type: ActorType;
  organisational_unit_codes: string[];
}

export interface SessionCandidate {
  workflow_template_id: string;
  workflow_template_version: number;
  title: string;
  score: number;
  alias_hits: string[];
  retrieval_summary: RetrievalSummary;
  audience: SessionCandidateAudience;
  matched_fact_ids: string[];
}

export interface SelectionSessionDocument {
  _id: ObjectId;
  created_by: string;
  status: SelectionSessionStatus;
  messages: SelectionMessage[];
  candidates: SessionCandidate[];
  rounds_used: number;
  selected_workflow_template_id: string | null;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}
