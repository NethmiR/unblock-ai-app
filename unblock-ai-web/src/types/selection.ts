/**
 * TypeScript mirror of unblock-ai-api/src/lib/types/selection/{selection-dto,overview}.type.ts and the enums in
 * unblock-ai-api/src/data/constants/{selection,selection-error}.constant.ts.
 *
 * WHEN THE SCHEMA CHANGES, CHANGE THIS FILE IN THE SAME COMMIT.
 */
import type { RequesterProfileFactDto } from "./requester";
import type { AssigneeSource, TaskStepKind } from "./task";

export enum SelectionDecisionKind {
  MATCHED = "matched",
  AMBIGUOUS = "ambiguous",
  NO_MATCH = "no_match",
  MANUAL_CHOICE = "manual_choice",
  START_REQUESTED = "start_requested",
}

export enum SelectionSessionStatus {
  OPEN = "open",
  MATCHED = "matched",
  NO_MATCH = "no_match",
}

export enum SelectionMessageRole {
  REQUESTER = "requester",
  ASSISTANT = "assistant",
}

export enum SelectionTraceStep {
  PROFILE_READ = "profile_read",
  CANDIDATES_RETRIEVED = "candidates_retrieved",
  CANDIDATES_REUSED = "candidates_reused",
  EXCLUDED_BY_AUDIENCE = "excluded_by_audience",
  EXCLUDED_BY_REQUESTER_TYPE = "excluded_by_requester_type",
  SELECTOR_CONSULTED = "selector_consulted",
  SELECTOR_NOT_NEEDED = "selector_not_needed",
  ROUND_LIMIT_REACHED = "round_limit_reached",
}

export enum SelectionErrorCode {
  SELECTION_SESSION_NOT_FOUND = "SELECTION_SESSION_NOT_FOUND",
  SELECTION_SESSION_LIMIT_REACHED = "SELECTION_SESSION_LIMIT_REACHED",
  SELECTION_OPTION_NOT_OFFERED = "SELECTION_OPTION_NOT_OFFERED",
  SELECTION_SESSION_NOT_MATCHED = "SELECTION_SESSION_NOT_MATCHED",
  SELECTION_FAILED = "SELECTION_FAILED",
}

export const SELECTION_FIELD_LIMIT = { MESSAGE_MAX_LENGTH: 1000, MESSAGES_PER_SESSION_MAX: 20 } as const;

export interface WorkflowOverviewAssigneeDto {
  source: AssigneeSource;
  label: string | null;
}

export interface WorkflowOverviewStepDto {
  id: string;
  name: string;
  kind: TaskStepKind;
  assignee: WorkflowOverviewAssigneeDto | null;
  is_conditional: boolean;
}

export interface WorkflowOverviewDto {
  workflow_template_id: string;
  title: string;
  one_liner: string;
  description: string;
  steps: WorkflowOverviewStepDto[];
  information_needed: string[];
  requires_approver_details: boolean;
}

export interface SelectionMatchDto {
  overview: WorkflowOverviewDto;
  matched_facts: RequesterProfileFactDto[];
}

export interface SelectionOptionDto {
  id: string;
  label: string;
  workflow_template_id: string | null;
}

export interface SelectionTraceEntryDto {
  step: SelectionTraceStep;
  count: number;
  workflow_template_titles: string[];
}

export interface RequesterSelectionMessageDto {
  id: string;
  role: SelectionMessageRole.REQUESTER;
  text: string;
  sent_at: string;
}

export interface AssistantSelectionMessageDto {
  id: string;
  role: SelectionMessageRole.ASSISTANT;
  decision: SelectionDecisionKind;
  question: string | null;
  options: SelectionOptionDto[];
  match: SelectionMatchDto | null;
  trace: SelectionTraceEntryDto[];
  sent_at: string;
}

export type SelectionMessageDto = RequesterSelectionMessageDto | AssistantSelectionMessageDto;

export interface SelectionSessionDto {
  id: string;
  status: SelectionSessionStatus;
  messages: SelectionMessageDto[];
  expires_at: string;
}

export interface SelectionCatalogueDto {
  workflow_templates: WorkflowOverviewDto[];
}

export interface SelectionMessageRequest {
  message: string;
}

export interface SelectionChooseRequest {
  workflow_template_id: string;
}
