import { AssigneeSource } from "../../data/constants/assignee.constant.js";
import { COMMENT_REQUIRED_DECISIONS, TaskStepOrigin } from "../../data/constants/task.constant.js";
import { informationExchanges, submittedFormSections, taskSubmittedAt } from "../task/task-view.util.js";
import { serializeAssignee, serializeRequesterSnapshot } from "./task-serializer.util.js";
import type { ApproverView, ApproverViewDto } from "../../lib/types/approval/approval.type.js";
import type { TaskAssigneeDto } from "../../lib/types/task/task-dto.type.js";

const UNKNOWN_APPROVER: TaskAssigneeDto = {
  source: AssigneeSource.SYSTEM,
  full_name: null,
  email: null,
  designation_title: null,
  organisational_unit_name: null,
  note: null,
};

export function serializeApproverView({ context, allowedDecisions, computed }: ApproverView): ApproverViewDto {
  const { task, step } = context;
  const approval = step.approval;
  return {
    task: {
      reference: task.reference,
      title: task.title,
      submitted_at: taskSubmittedAt(task).toISOString(),
      requester: serializeRequesterSnapshot(task.requester),
    },
    step: {
      id: step.id,
      name: step.name,
      description: step.description,
      instructions_to_approver: step.instructions_to_approver,
      is_repeat: step.origin === TaskStepOrigin.APPROVAL_REPEAT,
    },
    approver: step.assignee ? serializeAssignee(step.assignee) : UNKNOWN_APPROVER,
    sections: submittedFormSections(task),
    computed,
    information_exchanges: informationExchanges(task)
      .filter((exchange) => exchange.step.activated_at !== null)
      .map((exchange) => ({
        asked_by: exchange.askedBy ?? "",
        question: exchange.question,
        answer: exchange.answer,
        asked_at: (exchange.step.activated_at ?? task.created_at).toISOString(),
        answered_at: exchange.step.completed_at?.toISOString() ?? null,
      })),
    history: task.steps.flatMap((candidate) =>
      candidate.outcome === null || candidate.completed_at === null || candidate.id === step.id
        ? []
        : [
            {
              step_name: candidate.name,
              actor_name: candidate.assignee?.full_name ?? null,
              decision: candidate.approval?.decision ?? null,
              outcome: candidate.outcome,
              comment: candidate.approval?.comment ?? null,
              at: candidate.completed_at.toISOString(),
            },
          ],
    ),
    plan: task.steps.map((candidate) => ({
      name: candidate.name,
      kind: candidate.kind,
      status: candidate.status,
      assignee: candidate.assignee ? serializeAssignee(candidate.assignee) : null,
      is_current: candidate.id === step.id,
    })),
    allowed_decisions: [...allowedDecisions],
    comment_required_decisions: [...COMMENT_REQUIRED_DECISIONS],
    decided:
      approval?.decision != null && approval.decided_at !== null
        ? { decision: approval.decision, comment: approval.comment, decided_at: approval.decided_at.toISOString() }
        : null,
  };
}
