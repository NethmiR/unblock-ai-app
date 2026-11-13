import { SelectionDecisionKind, SelectionMessageRole } from "../../data/constants/selection.constant.js";
import { serializeDesignationReference } from "./designation-serializer.util.js";
import { serializeOrganisationalUnitReference } from "./organisational-unit-serializer.util.js";
import type { RequesterProfileFact } from "../../lib/types/requester/requester.type.js";
import type { WorkflowOverview } from "../../lib/types/selection/overview.type.js";
import type {
  RequesterProfileFactDto,
  SelectionCatalogueDto,
  SelectionMatchDto,
  SelectionMessageDto,
  SelectionSessionDto,
  SelectionSessionView,
} from "../../lib/types/selection/selection-dto.type.js";
import type { AssistantSelectionMessage, SelectionMessage } from "../../lib/types/selection/session.type.js";

const MATCH_DECISIONS: readonly SelectionDecisionKind[] = [SelectionDecisionKind.MATCHED, SelectionDecisionKind.START_REQUESTED];

export function serializeRequesterProfileFact(fact: RequesterProfileFact): RequesterProfileFactDto {
  return {
    id: fact.id,
    kind: fact.kind,
    unit: serializeOrganisationalUnitReference(fact.unit),
    parent: fact.parent ? serializeOrganisationalUnitReference(fact.parent) : null,
    designation: fact.designation ? serializeDesignationReference(fact.designation) : null,
  };
}

function serializeMatch(message: AssistantSelectionMessage, view: SelectionSessionView): SelectionMatchDto | null {
  if (!MATCH_DECISIONS.includes(message.decision) || message.workflow_template_id === null) return null;
  const overview = view.overviews.get(message.workflow_template_id);
  if (!overview) return null;
  const factIds = new Set(message.matched_fact_ids);
  return {
    overview,
    matched_facts: view.facts.filter((fact) => factIds.has(fact.id)).map(serializeRequesterProfileFact),
  };
}

function serializeMessage(message: SelectionMessage, view: SelectionSessionView): SelectionMessageDto {
  if (message.role === SelectionMessageRole.REQUESTER) {
    return { id: message.id, role: message.role, text: message.text, sent_at: message.sent_at.toISOString() };
  }
  return {
    id: message.id,
    role: message.role,
    decision: message.decision,
    question: message.question,
    options: message.options.map((option) => ({ ...option })),
    match: serializeMatch(message, view),
    trace: message.trace.map((entry) => ({ ...entry, workflow_template_titles: [...entry.workflow_template_titles] })),
    sent_at: message.sent_at.toISOString(),
  };
}

export function serializeSelectionSession(view: SelectionSessionView): SelectionSessionDto {
  return {
    id: String(view.session._id),
    status: view.session.status,
    messages: view.session.messages.map((message) => serializeMessage(message, view)),
    expires_at: view.session.expires_at.toISOString(),
  };
}

export function serializeSelectionCatalogue(overviews: readonly WorkflowOverview[]): SelectionCatalogueDto {
  return { workflow_templates: [...overviews] };
}
