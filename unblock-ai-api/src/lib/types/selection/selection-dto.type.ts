import type {
  SelectionDecisionKind,
  SelectionMessageRole,
  SelectionSessionStatus,
  SelectionTraceStep,
} from "../../../data/constants/selection.constant.js";
import type { RequesterProfileFactKind } from "../../../data/constants/requester.constant.js";
import type { DesignationReferenceDto } from "../designation/designation.type.js";
import type { OrganisationalUnitReferenceDto } from "../organisational-unit/organisational-unit.type.js";
import type { RequesterProfileFact } from "../requester/requester.type.js";
import type { WorkflowOverview, WorkflowOverviewAssignee, WorkflowOverviewStep } from "./overview.type.js";
import type { SelectionSessionDocument } from "./session.type.js";

export interface RequesterProfileFactDto {
  id: string;
  kind: RequesterProfileFactKind;
  unit: OrganisationalUnitReferenceDto;
  parent: OrganisationalUnitReferenceDto | null;
  designation: DesignationReferenceDto | null;
}

export type WorkflowOverviewAssigneeDto = WorkflowOverviewAssignee;
export type WorkflowOverviewStepDto = WorkflowOverviewStep;
export type WorkflowOverviewDto = WorkflowOverview;

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

export interface SelectionSessionView {
  session: SelectionSessionDocument;
  facts: RequesterProfileFact[];
  overviews: ReadonlyMap<string, WorkflowOverview>;
}

export interface SelectionMatch {
  workflowTemplateId: string;
  conversation: Array<{ role: SelectionMessageRole; text: string; sent_at: Date }>;
}
