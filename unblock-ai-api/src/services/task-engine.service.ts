import {
  ACTIVE_TASK_STEP_STATUSES,
  ApprovalDecision,
  COMPLETING_STEP_OUTCOMES,
  POSITIVE_STEP_OUTCOMES,
  TASK_STEP_OUTCOME_BY_DECISION,
  TaskAuditEvent,
  TaskEffectKind,
  TaskStatus,
  TaskStepKind,
  TaskStepOrigin,
  TaskStepOutcome,
  TaskStepStatus,
  TERMINAL_TASK_STATUSES,
} from "../data/constants/task.constant.js";
import { TaskFormStatus } from "../data/constants/task-form.constant.js";
import { approvalAlreadyDecided, approvalDecisionNotAllowed } from "../errors/approval.error.js";
import { taskFormAlreadySubmitted, taskFormNotAwaitingInput, taskFormNotFound, taskNotActive } from "../errors/task.error.js";
import { evaluateCondition } from "../utils/workflow/condition-evaluator.util.js";
import { buildConditionNamespace } from "../utils/task/task-condition-namespace.util.js";
import { applyAssigneeFieldValues } from "../utils/task/task-assignee-binding.util.js";
import {
  definitionStepIdOf,
  informationRequestCount,
  insertInformationRequest,
} from "../utils/task/information-request-insertion.util.js";
import type { TaskAuditEntry, TaskDocument, TaskStepRecord } from "../lib/types/task/task-document.type.js";
import type { TaskEffect, TaskEngineContext, TaskEngineResult } from "../lib/types/task/task-engine.type.js";
import type { CompletionRule } from "../lib/types/workflow/workflow.type.js";

enum AdvanceCause {
  START = "start",
  FORM = "form",
  DECISION = "decision",
}

const ANY_STEP_COMPLETE: CompletionRule = "any_step_complete";

interface Working {
  task: TaskDocument;
  effects: TaskEffect[];
}

function audit(task: TaskDocument, event: TaskAuditEvent, now: Date, stepId: string | null = null, detail: string | null = null): TaskDocument {
  const entry: TaskAuditEntry = { event, step_id: stepId, detail, created_at: now };
  return { ...task, audit: [...task.audit, entry] };
}

function replaceStep(task: TaskDocument, stepId: string, change: (step: TaskStepRecord) => TaskStepRecord): TaskDocument {
  return { ...task, steps: task.steps.map((step) => (step.id === stepId ? change(step) : step)) };
}

function isActive(step: TaskStepRecord): boolean {
  return ACTIVE_TASK_STEP_STATUSES.includes(step.status);
}

function isOpen(step: TaskStepRecord): boolean {
  return step.status === TaskStepStatus.UPCOMING || isActive(step);
}

function assertActiveTask(task: TaskDocument): void {
  if (TERMINAL_TASK_STATUSES.includes(task.status)) throw taskNotActive();
}

function isDependencySatisfied(task: TaskDocument, stepId: string, requiredOutcome: TaskStepOutcome): boolean {
  const target = task.steps.find((step) => step.id === stepId);
  if (!target) return false;
  if (target.status === TaskStepStatus.SKIPPED) return true;
  if (target.status !== TaskStepStatus.COMPLETED) return false;
  return target.kind !== TaskStepKind.APPROVAL || target.outcome === requiredOutcome;
}

function latestInstances(task: TaskDocument): Map<string, TaskStepRecord> {
  const latest = new Map<string, TaskStepRecord>();
  for (const step of task.steps) {
    if (step.definition_step_id !== null && step.kind !== TaskStepKind.INFORMATION_REQUEST) latest.set(step.definition_step_id, step);
  }
  return latest;
}

function cancelOpenSteps(task: TaskDocument, now: Date): { task: TaskDocument; revoked: boolean } {
  let revoked = false;
  const steps = task.steps.map((step) => {
    if (!isOpen(step)) return step;
    if (step.status === TaskStepStatus.AWAITING_APPROVER) revoked = true;
    return { ...step, status: TaskStepStatus.CANCELLED, completed_at: now };
  });
  return { task: { ...task, steps }, revoked };
}

export class TaskEngineService {
  start(task: TaskDocument, context: TaskEngineContext): TaskEngineResult {
    const working: Working = { task: audit(task, TaskAuditEvent.TASK_CREATED, context.now), effects: [] };
    return this.advance(working, context, AdvanceCause.START);
  }

  submitForm(task: TaskDocument, formId: string, context: TaskEngineContext): TaskEngineResult {
    assertActiveTask(task);
    const form = task.forms.find((candidate) => candidate.id === formId);
    if (!form) throw taskFormNotFound(formId);
    if (form.status === TaskFormStatus.SUBMITTED) throw taskFormAlreadySubmitted();
    const step = task.steps.find((candidate) => candidate.id === form.step_id);
    if (!step || step.status !== TaskStepStatus.AWAITING_REQUESTER) throw taskFormNotAwaitingInput();

    const submitted = { ...form, status: TaskFormStatus.SUBMITTED, submitted_at: context.now, saved_at: context.now };
    let next: TaskDocument = {
      ...task,
      forms: task.forms.map((candidate) => (candidate.id === formId ? submitted : candidate)),
    };
    next = replaceStep(next, step.id, (current) => ({
      ...current,
      status: TaskStepStatus.COMPLETED,
      outcome: TaskStepOutcome.COMPLETED,
      completed_at: context.now,
    }));
    next = applyAssigneeFieldValues(next, submitted);
    next = audit(next, TaskAuditEvent.FORM_SUBMITTED, context.now, step.id);
    return this.advance({ task: next, effects: [] }, context, AdvanceCause.FORM);
  }

  allowedDecisions(task: TaskDocument, stepId: string, context: Pick<TaskEngineContext, "maxInformationRequestsPerStep">): ApprovalDecision[] {
    const step = task.steps.find((candidate) => candidate.id === stepId);
    if (!step || step.approval === null) return [];
    const canAsk =
      step.approval.allows_information_request
      && informationRequestCount(task, definitionStepIdOf(step)) < context.maxInformationRequestsPerStep;
    return canAsk
      ? [ApprovalDecision.APPROVED, ApprovalDecision.REJECTED, ApprovalDecision.REQUEST_MORE_INFO]
      : [ApprovalDecision.APPROVED, ApprovalDecision.REJECTED];
  }

  recordDecision(
    task: TaskDocument,
    stepId: string,
    decision: ApprovalDecision,
    comment: string | null,
    context: TaskEngineContext,
  ): TaskEngineResult {
    assertActiveTask(task);
    const step = task.steps.find((candidate) => candidate.id === stepId);
    if (!step || step.approval === null || step.approval.decision !== null || step.status !== TaskStepStatus.AWAITING_APPROVER) {
      throw approvalAlreadyDecided();
    }
    if (!this.allowedDecisions(task, stepId, context).includes(decision)) throw approvalDecisionNotAllowed(decision);

    const outcome = TASK_STEP_OUTCOME_BY_DECISION[decision];
    let next = replaceStep(task, stepId, (current) => ({
      ...current,
      status: TaskStepStatus.COMPLETED,
      outcome,
      completed_at: context.now,
      approval: current.approval && {
        ...current.approval,
        token_hash: null,
        decision,
        comment,
        decided_at: context.now,
      },
    }));
    next = audit(next, TaskAuditEvent.DECISION_RECORDED, context.now, stepId, decision);

    if (decision === ApprovalDecision.REJECTED && step.approval.terminates_on_rejection) {
      return this.terminate({ task: next, effects: [] }, context, stepId);
    }
    if (decision === ApprovalDecision.REQUEST_MORE_INFO) {
      next = insertInformationRequest(next, stepId, comment ?? "", context.now);
      next = audit(next, TaskAuditEvent.INFORMATION_REQUESTED, context.now, stepId, comment);
    }
    return this.advance({ task: next, effects: [] }, context, AdvanceCause.DECISION);
  }

  cancel(task: TaskDocument, context: TaskEngineContext): TaskEngineResult {
    assertActiveTask(task);
    const { task: cancelled } = cancelOpenSteps(task, context.now);
    const next = audit({ ...cancelled, status: TaskStatus.CANCELLED }, TaskAuditEvent.TASK_CANCELLED, context.now);
    return { task: next, effects: [{ kind: TaskEffectKind.REVOKE_APPROVAL_LINKS }] };
  }

  private terminate(working: Working, context: TaskEngineContext, rejectedStepId: string): TaskEngineResult {
    const { task } = cancelOpenSteps(working.task, context.now);
    const next = audit({ ...task, status: TaskStatus.REJECTED }, TaskAuditEvent.TASK_REJECTED, context.now, rejectedStepId);
    return {
      task: next,
      effects: [
        ...working.effects,
        { kind: TaskEffectKind.REVOKE_APPROVAL_LINKS },
        { kind: TaskEffectKind.NOTIFY_TASK_REJECTED, step_id: rejectedStepId },
      ],
    };
  }

  private advance(working: Working, context: TaskEngineContext, cause: AdvanceCause): TaskEngineResult {
    let { task } = working;
    const effects = [...working.effects];
    let changed = true;

    while (changed) {
      changed = false;
      for (const step of task.steps) {
        if (step.status !== TaskStepStatus.UPCOMING) continue;
        if (!step.depends_on.every((dependency) => isDependencySatisfied(task, dependency.step_id, dependency.required_outcome))) continue;
        changed = true;
        task = this.activate(task, step, context, cause, effects);
        break;
      }
    }

    if (this.isComplete(task, context)) {
      const { task: closed, revoked } = cancelOpenSteps(task, context.now);
      const completed = audit({ ...closed, status: TaskStatus.COMPLETED, completed_at: context.now }, TaskAuditEvent.TASK_COMPLETED, context.now);
      if (revoked) effects.push({ kind: TaskEffectKind.REVOKE_APPROVAL_LINKS });
      effects.push({ kind: TaskEffectKind.NOTIFY_TASK_COMPLETED });
      return { task: completed, effects };
    }

    if (!task.steps.some(isActive)) return this.deadEnd(task, context, effects);
    return { task, effects };
  }

  private activate(
    task: TaskDocument,
    step: TaskStepRecord,
    context: TaskEngineContext,
    cause: AdvanceCause,
    effects: TaskEffect[],
  ): TaskDocument {
    if (step.condition !== null) {
      const result = evaluateCondition(step.condition, buildConditionNamespace(task, context.definition, context.now));
      if (result === false) {
        const skipped = replaceStep(task, step.id, (current) => ({
          ...current,
          status: TaskStepStatus.SKIPPED,
          outcome: TaskStepOutcome.SKIPPED,
          completed_at: context.now,
        }));
        return audit(skipped, TaskAuditEvent.STEP_SKIPPED, context.now, step.id);
      }
    }

    const activated = (status: TaskStepStatus): TaskDocument =>
      audit(
        replaceStep(task, step.id, (current) => ({ ...current, status, activated_at: context.now })),
        TaskAuditEvent.STEP_ACTIVATED,
        context.now,
        step.id,
      );
    const completedNow = (): TaskDocument =>
      audit(
        replaceStep(task, step.id, (current) => ({
          ...current,
          status: TaskStepStatus.COMPLETED,
          outcome: TaskStepOutcome.COMPLETED,
          activated_at: context.now,
          completed_at: context.now,
        })),
        TaskAuditEvent.STEP_ACTIVATED,
        context.now,
        step.id,
      );

    switch (step.kind) {
      case TaskStepKind.FORM:
        if (cause === AdvanceCause.DECISION) effects.push({ kind: TaskEffectKind.NOTIFY_REQUESTER_ACTION_REQUIRED, step_id: step.id });
        return activated(TaskStepStatus.AWAITING_REQUESTER);
      case TaskStepKind.INFORMATION_REQUEST:
        effects.push({ kind: TaskEffectKind.NOTIFY_INFORMATION_REQUESTED, step_id: step.id });
        return activated(TaskStepStatus.AWAITING_REQUESTER);
      case TaskStepKind.APPROVAL:
        effects.push({ kind: TaskEffectKind.DISPATCH_APPROVAL, step_id: step.id });
        return activated(TaskStepStatus.AWAITING_APPROVER);
      case TaskStepKind.NOTIFICATION:
        effects.push({ kind: TaskEffectKind.SEND_STEP_NOTIFICATION, step_id: step.id });
        return completedNow();
      case TaskStepKind.AUTOMATED_ACTION:
        return completedNow();
      default: {
        const unreachable: never = step.kind;
        return unreachable;
      }
    }
  }

  private isComplete(task: TaskDocument, context: TaskEngineContext): boolean {
    const { completion, steps } = context.definition;
    const latest = latestInstances(task);
    const required = completion.required_steps.length > 0 ? completion.required_steps : steps.map((step) => step.id);
    const instances = required.map((id) => latest.get(id));
    if (instances.length === 0 || task.steps.some((step) => step.origin === TaskStepOrigin.ENTRY_FORM && step.status !== TaskStepStatus.COMPLETED)) {
      return false;
    }
    if (completion.rule === ANY_STEP_COMPLETE) {
      return instances.some((step) => step !== undefined && step.outcome !== null && POSITIVE_STEP_OUTCOMES.includes(step.outcome));
    }
    return instances.every((step) => step !== undefined && step.outcome !== null && COMPLETING_STEP_OUTCOMES.includes(step.outcome));
  }

  private deadEnd(task: TaskDocument, context: TaskEngineContext, effects: TaskEffect[]): TaskEngineResult {
    const rejected = [...task.steps].reverse().find((step) => step.outcome === TaskStepOutcome.REJECTED);
    const { task: closed } = cancelOpenSteps(task, context.now);
    if (rejected) {
      const next = audit({ ...closed, status: TaskStatus.REJECTED }, TaskAuditEvent.TASK_REJECTED, context.now, rejected.id);
      return {
        task: next,
        effects: [...effects, { kind: TaskEffectKind.REVOKE_APPROVAL_LINKS }, { kind: TaskEffectKind.NOTIFY_TASK_REJECTED, step_id: rejected.id }],
      };
    }
    const next = audit({ ...closed, status: TaskStatus.CANCELLED }, TaskAuditEvent.TASK_CANCELLED, context.now);
    return { task: next, effects: [...effects, { kind: TaskEffectKind.REVOKE_APPROVAL_LINKS }] };
  }
}
