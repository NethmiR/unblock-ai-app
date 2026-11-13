import { SelectionMessageRole } from "../../data/constants/selection.constant.js";
import { TaskStepKind, TaskStepStatus } from "../../data/constants/task.constant.js";
import { TRANSCRIPT_COPY, TRANSCRIPT_DECISION_LABEL } from "../../data/constants/transcript.constant.js";
import {
  computedFields,
  describeRequesterUnit,
  informationExchanges,
  submittedFormSections,
  taskSubmittedAt,
} from "../task/task-view.util.js";
import type { TaskTranscript, TranscriptApprovalRow } from "../../lib/types/document/document.type.js";
import type { TaskDocument } from "../../lib/types/task/task-document.type.js";
import type { WorkflowDefinition } from "../../lib/types/workflow/workflow.type.js";

export interface TaskTranscriptOptions {
  institutionName: string;
  now: Date;
}

function approvalRows(task: TaskDocument): TranscriptApprovalRow[] {
  return task.steps.flatMap((step) => {
    if (step.kind !== TaskStepKind.APPROVAL || step.approval?.decision == null) return [];
    return [
      {
        step_name: step.name,
        approver_name: step.assignee?.full_name ?? null,
        designation: step.assignee?.designation_title ?? null,
        decision: TRANSCRIPT_DECISION_LABEL[step.approval.decision],
        comment: step.approval.comment,
        decided_at: step.approval.decided_at,
      },
    ];
  });
}

export function buildTaskTranscript(task: TaskDocument, definition: WorkflowDefinition, options: TaskTranscriptOptions): TaskTranscript {
  return {
    reference: task.reference,
    title: task.title,
    description: definition.description,
    institution_name: options.institutionName,
    submitted_at: taskSubmittedAt(task),
    completed_at: task.completed_at ?? options.now,
    requester: [
      { label: TRANSCRIPT_COPY.REQUESTER_NAME, value: task.requester.full_name },
      { label: TRANSCRIPT_COPY.REQUESTER_EMAIL, value: task.requester.email },
      ...task.requester.units.map((unit) => ({ label: TRANSCRIPT_COPY.REQUESTER_UNIT, value: describeRequesterUnit(unit) })),
    ],
    conversation: task.conversation.filter((message) => message.role === SelectionMessageRole.REQUESTER).map((message) => message.text),
    sections: submittedFormSections(task),
    information_exchanges: informationExchanges(task).map((exchange) => ({
      asked_by: exchange.askedBy,
      question: exchange.question,
      answer: exchange.answer,
      asked_at: exchange.step.activated_at,
      answered_at: exchange.step.completed_at,
    })),
    approvals: approvalRows(task),
    skipped_steps: task.steps.filter((step) => step.status === TaskStepStatus.SKIPPED).map((step) => step.name),
    computed: computedFields(task, definition),
  };
}
