import { TaskModel } from "../models/task.model.js";
import { WorkflowService } from "./workflow.service.js";
import { ExecutionService } from "./execution.service.js";
import { NotificationService } from "./notification.service.js";
import { TaskService } from "./task.service.js";
import { issueTokensForDispatched, verifyToken } from "../utils/approval/token.util.js";
import { allowedOutcomes, resolveOutcomeAction } from "../utils/approval/outcome-resolver.util.js";
import { formatRequirementValue } from "../utils/approval/answer-format.util.js";
import { NotFoundError } from "../errors/not-found.error.js";
import { ConflictError } from "../errors/conflict.error.js";
import { ValidationError } from "../errors/validation.error.js";
import { STEP_STATE } from "../data/constants/status.constant.js";
import type { AppConfig } from "../lib/types/config/config.type.js";
import type { TaskDocument, TaskStepState, StepOutcomeResult } from "../lib/types/task/task.type.js";
import type { WorkflowDefinition } from "../lib/types/workflow/workflow.type.js";
import type { ApproverViewDto, ApproverStatus, DecisionResultDto } from "../lib/types/approval/approval.type.js";

export interface ApprovalServiceOptions {
  taskModel: TaskModel;
  workflowService: WorkflowService;
  executionService: ExecutionService;
  notificationService: NotificationService;
  taskService: TaskService;
  config: AppConfig;
}

interface TokenContext {
  task: TaskDocument;
  workflow: WorkflowDefinition;
  step: TaskStepState;
}

export class ApprovalService {
  private readonly taskModel: TaskModel;
  private readonly workflowService: WorkflowService;
  private readonly executionService: ExecutionService;
  private readonly notificationService: NotificationService;
  private readonly taskService: TaskService;
  private readonly config: AppConfig;

  constructor({
    taskModel,
    workflowService,
    executionService,
    notificationService,
    taskService,
    config,
  }: ApprovalServiceOptions) {
    this.taskModel = taskModel;
    this.workflowService = workflowService;
    this.executionService = executionService;
    this.notificationService = notificationService;
    this.taskService = taskService;
    this.config = config;
  }

  async getApproverView(token: string): Promise<ApproverViewDto> {
    const { task, workflow, step } = await this.resolveToken(token);
    const workflowStep = workflow.steps.find((s) => s.id === step.step_id);
    if (!workflowStep) throw NotFoundError.of("Step", step.step_id);

    const requesterAnswers = task.requirements
      .filter((r) => r.source === "input")
      .map((r) => ({ label: r.label, value: formatRequirementValue(task.values[r.key] ?? null) }));

    const priorDecisions = task.steps
      .filter((s) => s.outcome !== null)
      .sort((a, b) => (a.responded_at?.getTime() ?? 0) - (b.responded_at?.getTime() ?? 0))
      .map((s) => ({
        step: workflow.steps.find((ws) => ws.id === s.step_id)?.name ?? s.step_id,
        outcome: s.outcome as string,
        reason: s.reason,
        at: s.responded_at as Date,
      }));

    const stepOrder = new Map(workflow.steps.map((ws, i) => [ws.id, i]));

    const approvers = task.requirements
      .filter((r) => r.source === "actor")
      .map((r) => {
        const taskStep = task.steps.find((s) => s.step_id === r.ref);
        const status: ApproverStatus =
          taskStep?.outcome ??
          (taskStep?.state === STEP_STATE.PENDING_APPROVAL ? "awaiting" : "not_yet_reached");

        return {
          step_id: r.ref,
          designation: r.label,
          name: taskStep?.assignee?.name ?? null,
          email: taskStep?.assignee?.email ?? null,
          status,
          is_current: r.ref === step.step_id,
          decided_at: taskStep?.responded_at ?? null,
        };
      })
      .sort((a, b) => (stepOrder.get(a.step_id) ?? 0) - (stepOrder.get(b.step_id) ?? 0));

    const outcomes = (Object.entries(workflowStep.outcomes) as Array<[StepOutcomeResult, (typeof workflowStep.outcomes)[StepOutcomeResult]]>)
      .filter(([, declared]) => declared !== null)
      .map(([outcome, declared]) => ({ outcome, include_reason: declared?.include_reason ?? false }));

    return {
      task_reference: task.reference,
      workflow_title: workflow.title,
      step: {
        step_id: workflowStep.id,
        name: workflowStep.name,
        instructions_to_approver: workflowStep.instructions_to_approver,
        response_fields: workflowStep.response_fields,
      },
      approver: step.assignee,
      requester_answers: requesterAnswers,
      computed: [],
      prior_decisions: priorDecisions,
      approvers,
      allowed_outcomes: allowedOutcomes(workflowStep),
      outcomes,
      already_decided: step.token_used_at !== null,
      decided_outcome: step.outcome,
      decided_at: step.responded_at,
    };
  }

  async submitDecision(token: string, outcome: StepOutcomeResult, reason: string | null): Promise<DecisionResultDto> {
    const { task, workflow, step } = await this.resolveToken(token);

    if (step.token_used_at !== null) {
      throw new ConflictError(`Approval token has already been used for step '${step.step_id}'`);
    }

    if (step.token_expires_at !== null && step.token_expires_at.getTime() < Date.now()) {
      throw new ConflictError(
        `Approval link for step '${step.step_id}' expired on ${step.token_expires_at.toISOString()}. ` +
          `Ask the requester to have it reissued.`,
      );
    }

    if (step.state !== STEP_STATE.PENDING_APPROVAL) {
      throw new ConflictError(
        `Step '${step.step_id}' is no longer awaiting approval (current state: '${step.state}')`,
      );
    }

    const workflowStep = workflow.steps.find((s) => s.id === step.step_id);
    if (!workflowStep) throw NotFoundError.of("Step", step.step_id);

    const stepOutcome = resolveOutcomeAction(workflowStep, outcome);
    if (stepOutcome.include_reason && (!reason || reason.trim().length === 0)) {
      throw new ValidationError(`A reason is required for outcome '${outcome}' on step '${step.step_id}'`);
    }

    const result = this.executionService.applyDecision(task, workflow, step.step_id, outcome, reason);
    const stepsWithTokens = issueTokensForDispatched(
      String(task._id),
      result.steps,
      result.dispatched,
      this.config.mail.tokenSecret,
      this.config.mail.tokenTtlDays,
    );

    const wrote = await this.taskModel.updateStepAndStatusIfUnused(
      task._id,
      step.step_id,
      stepsWithTokens,
      result.status,
    );
    if (!wrote) {
      throw new ConflictError(`Approval token has already been used for step '${step.step_id}'`);
    }

    const updated = await this.taskModel.findById(task._id);
    if (!updated) throw NotFoundError.of("Task", String(task._id));

    await this.taskModel.appendAudit(updated._id, {
      type: "decision_recorded",
      detail: `${step.step_id}:${outcome}`,
      created_at: new Date(),
    });

    const decidedStep = updated.steps.find((s) => s.step_id === step.step_id) ?? null;
    await this.sendDecisionNotifications(updated, workflow, result, decidedStep);

    if (stepOutcome.action === "reopen_input") {
      await this.taskService.reopenForMoreInfo(updated._id, step.step_id, reason ?? "");
    }

    return {
      task_id: String(updated._id),
      step_id: step.step_id,
      outcome,
      status: result.status,
      completed: result.completed,
      terminated: result.terminated,
    };
  }

  private async sendDecisionNotifications(
    task: TaskDocument,
    workflow: WorkflowDefinition,
    result: { dispatched: string[]; terminated: boolean; completed: boolean },
    decidedStep: TaskStepState | null,
  ): Promise<void> {
    for (const stepId of result.dispatched) {
      const step = task.steps.find((s) => s.step_id === stepId);
      if (!step) continue;
      const sent = await this.notificationService.sendApprovalRequest(task, workflow, step);
      if (sent) await this.taskModel.replaceSteps(task._id, this.stampNotified(task.steps, stepId));
    }

    if (result.terminated && decidedStep) {
      await this.notificationService.sendRejectionNotice(task, workflow, decidedStep);
    }

    if (result.completed) {
      await this.notificationService.sendCompletionNotice(task, workflow);
    }
  }

  private stampNotified(steps: TaskStepState[], stepId: string): TaskStepState[] {
    return steps.map((s) => (s.step_id === stepId ? { ...s, notified_at: new Date() } : s));
  }

  private async resolveToken(token: string): Promise<TokenContext> {
    const payload = verifyToken(token, this.config.mail.tokenSecret);
    if (!payload) throw NotFoundError.of("Approval token", token);

    const task = await this.taskModel.findByStepToken(token);
    if (!task) throw NotFoundError.of("Approval token", token);

    const step = task.steps.find((s) => s.step_id === payload.step_id);
    if (!step) throw NotFoundError.of("Approval token", token);

    const workflow = await this.workflowService.getDocument(task.workflow_id, task.version);

    return { task, workflow, step };
  }
}
