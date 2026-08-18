import { STEP_STATE, TASK_STATUS } from "../data/constants/status.constant.js";
import { resolveOutcomeAction } from "../utils/approval/outcome-resolver.util.js";
import { ConflictError } from "../errors/conflict.error.js";
import type { TaskDocument, TaskStatus, TaskStepState, StepOutcomeResult } from "../lib/types/task/task.type.js";
import type { WorkflowDefinition } from "../lib/types/workflow/workflow.type.js";

const MAX_REOPENS = 3;

export interface AdvanceResult {
  steps: TaskStepState[];
  status: TaskStatus;
  dispatched: string[];
  completed: boolean;
  terminated: boolean;
  termination_reason: string | null;
}

function stepMap(workflow: WorkflowDefinition): Map<string, WorkflowDefinition["steps"][number]> {
  return new Map(workflow.steps.map((step) => [step.id, step]));
}

function dependenciesSatisfied(step: TaskStepState, byId: Map<string, TaskStepState>): boolean {
  return step.depends_on.every((dep) => byId.get(dep.step_id)?.outcome === dep.required_outcome);
}

function evaluateCompletion(steps: TaskStepState[], workflow: WorkflowDefinition): boolean {
  const byId = new Map(steps.map((step) => [step.step_id, step]));
  const requiredIds = workflow.completion.required_steps;

  switch (workflow.completion.rule) {
    case "all_required_steps_complete":
      return requiredIds.every((id) => byId.get(id)?.outcome === "approved");
    case "any_step_complete":
      return requiredIds.some((id) => byId.get(id)?.outcome === "approved");
    case "specific_steps":
      return requiredIds.every((id) => byId.get(id)?.outcome === "approved");
    default:
      return false;
  }
}

export class ExecutionService {
  advance(task: TaskDocument, workflow: WorkflowDefinition): AdvanceResult {
    let steps = task.steps.map((step) => ({ ...step }));
    const workflowSteps = stepMap(workflow);

    const terminator = steps.find(
      (step) =>
        step.outcome === "rejected" &&
        workflowSteps.get(step.step_id)?.outcomes.rejected?.action === "terminate_workflow",
    );

    if (terminator) {
      steps = steps.map((step) => {
        if (step.state === STEP_STATE.APPROVED || step.state === STEP_STATE.REJECTED) return step;
        if (step.state === STEP_STATE.SKIPPED) return step;
        return { ...step, state: STEP_STATE.SKIPPED };
      });

      return {
        steps,
        status: TASK_STATUS.REJECTED,
        dispatched: [],
        completed: false,
        terminated: true,
        termination_reason: terminator.reason,
      };
    }

    const byId = new Map(steps.map((step) => [step.step_id, step]));
    steps = steps.map((step) => {
      if (step.state !== STEP_STATE.BLOCKED) return step;
      if (!dependenciesSatisfied(step, byId)) return step;
      return { ...step, state: STEP_STATE.READY };
    });

    const dispatched: string[] = [];
    steps = steps.map((step) => {
      if (step.state !== STEP_STATE.READY) return step;
      dispatched.push(step.step_id);
      return { ...step, state: STEP_STATE.PENDING_APPROVAL };
    });

    const completed = evaluateCompletion(steps, workflow);

    return {
      steps,
      status: completed ? TASK_STATUS.COMPLETED : task.status,
      dispatched,
      completed,
      terminated: false,
      termination_reason: null,
    };
  }

  applyDecision(
    task: TaskDocument,
    workflow: WorkflowDefinition,
    stepId: string,
    outcome: StepOutcomeResult,
    reason: string | null,
  ): AdvanceResult {
    const workflowStep = workflow.steps.find((step) => step.id === stepId);
    if (!workflowStep) {
      throw new Error(`Workflow '${workflow.workflow_id}' has no step '${stepId}'`);
    }

    const stepOutcome = resolveOutcomeAction(workflowStep, outcome);
    const now = new Date();

    const decidedSteps = task.steps.map((step) => {
      if (step.step_id !== stepId) return step;

      if (stepOutcome.action === "reopen_input") {
        if (step.reopen_count >= MAX_REOPENS) {
          throw new ConflictError(
            `Step '${stepId}' has already been reopened the maximum number of times (${MAX_REOPENS})`,
          );
        }

        return {
          ...step,
          state: STEP_STATE.READY,
          outcome,
          reason,
          responded_at: now,
          approval_token: null,
          token_expires_at: null,
          token_used_at: null,
          reopen_count: step.reopen_count + 1,
        };
      }

      return {
        ...step,
        state: outcome === "rejected" ? STEP_STATE.REJECTED : STEP_STATE.APPROVED,
        outcome,
        reason,
        responded_at: now,
        token_used_at: now,
      };
    });

    const decidedTask: TaskDocument = { ...task, steps: decidedSteps };

    if (stepOutcome.action === "reopen_input") {
      return {
        steps: decidedSteps,
        status: task.status,
        dispatched: [],
        completed: false,
        terminated: false,
        termination_reason: null,
      };
    }

    return this.advance(decidedTask, workflow);
  }
}
