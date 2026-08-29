import type { TaskDocument } from "../../lib/types/task/task.type.js";
import type { WorkflowDefinition } from "../../lib/types/workflow/workflow.type.js";
import type { WorkflowStep } from "../../lib/types/workflow/step.type.js";
import type {
  ApprovalRow,
  CompletionDocument,
  DocumentField,
  DocumentSection,
} from "../../lib/types/document/document.type.js";
import { formatRequirementValue } from "../approval/answer-format.util.js";
import { titleCaseRole } from "../task/requirement-builder.util.js";

export interface BuildCompletionDocumentOptions {
  institutionName: string;
  completedAt: Date;
  computed?: DocumentField[];
}

export function buildCompletionDocument(
  task: TaskDocument,
  workflow: WorkflowDefinition,
  options: BuildCompletionDocumentOptions,
): CompletionDocument {
  const sections: DocumentSection[] = [
    { title: "Request details", fields: buildRequestDetailsFields(task, workflow) },
  ];

  if (options.computed && options.computed.length > 0) {
    sections.push({ title: "Calculated values", fields: options.computed });
  }

  const additionalInfoFields = buildAdditionalInfoFields(task, workflow);
  if (additionalInfoFields.length > 0) {
    sections.push({ title: "Additional information provided", fields: additionalInfoFields });
  }

  return {
    reference: task.reference,
    workflow_title: workflow.title,
    workflow_description: workflow.description,
    institution_name: options.institutionName,
    submitted_at: task.created_at,
    completed_at: options.completedAt,
    sections,
    approvals: buildApprovalRows(task, workflow),
  };
}

function buildRequestDetailsFields(task: TaskDocument, workflow: WorkflowDefinition): DocumentField[] {
  return (workflow.inputs ?? [])
    .filter((input) => input.collected_from.resolution === "requester")
    .map((input) => ({
      label: input.label,
      value: resolveInputValue(task, input.id),
    }));
}

function resolveInputValue(task: TaskDocument, inputId: string): string {
  const requirement = task.requirements.find((r) => r.source === "input" && r.ref === inputId);
  if (!requirement) return "—";

  const formatted = formatRequirementValue(task.values[requirement.key] ?? null);
  return formatted === "" ? "—" : formatted;
}

function buildAdditionalInfoFields(task: TaskDocument, workflow: WorkflowDefinition): DocumentField[] {
  return task.requirements
    .filter((r) => r.key.startsWith("followup:"))
    .map((r) => {
      const step = workflow.steps.find((s) => s.id === r.ref);
      const stepName = step ? step.name : r.ref;
      const formatted = formatRequirementValue(task.values[r.key] ?? null);

      return {
        label: `${stepName}: ${r.label}`,
        value: formatted === "" ? "—" : formatted,
      };
    });
}

function buildApprovalRows(task: TaskDocument, workflow: WorkflowDefinition): ApprovalRow[] {
  const rows: ApprovalRow[] = [];

  for (const step of workflow.steps) {
    if (step.type !== "approval") continue;

    const taskStep = task.steps.find((s) => s.step_id === step.id);
    if (!taskStep || taskStep.state === "skipped") continue;

    rows.push({
      step_name: step.name,
      designation: resolveDesignation(step),
      name: taskStep.assignee?.name ?? null,
      email: taskStep.assignee?.email ?? null,
      outcome: taskStep.outcome ? titleCaseRole(taskStep.outcome) : "",
      decided_at: taskStep.responded_at,
      reason: taskStep.reason,
    });
  }

  return rows;
}

function resolveDesignation(step: WorkflowStep): string {
  if (step.assignee.display_name) return step.assignee.display_name;
  if (step.assignee.role) return titleCaseRole(step.assignee.role);
  return step.name;
}
