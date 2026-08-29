import type { ObjectId } from "mongodb";
import { TaskModel } from "../models/task.model.js";
import { SelectionService } from "./selection.service.js";
import { WorkflowService } from "./workflow.service.js";
import { PlannerService } from "./planner.service.js";
import { ExecutionService } from "./execution.service.js";
import { NotificationService } from "./notification.service.js";
import { AuditService } from "./audit.service.js";
import { CompletionDocumentService } from "./completion-document.service.js";
import { validateValue } from "../utils/task/value-validator.util.js";
import { buildReference } from "../utils/task/reference.util.js";
import { issueTokensForDispatched } from "../utils/approval/token.util.js";
import { logger } from "../utils/shared/logger.util.js";
import { TASK_STATUS, REQUIREMENT_STATUS, STEP_STATE } from "../data/constants/status.constant.js";
import { ConflictError } from "../errors/conflict.error.js";
import { ValidationError } from "../errors/validation.error.js";
import { NotFoundError } from "../errors/not-found.error.js";
import type { AppConfig } from "../lib/types/config/config.type.js";
import type { TaskDocument, TaskStatus, TaskStepState } from "../lib/types/task/task.type.js";
import type { NextRequirementDto } from "../lib/types/task/task.type.js";
import type { RequirementValue, TaskRequirement } from "../lib/types/task/requirement.type.js";
import type { TaskStatusDto, TaskTimelineEntry } from "../lib/types/approval/approval.type.js";
import type { AuditActor } from "../lib/types/audit/audit.type.js";
import type { RenderedDocument } from "../lib/types/document/document.type.js";

export interface TaskServiceOptions {
  taskModel: TaskModel;
  selectionService: SelectionService;
  workflowService: WorkflowService;
  plannerService: PlannerService;
  executionService: ExecutionService;
  notificationService: NotificationService;
  auditService: AuditService;
  completionDocumentService: CompletionDocumentService;
  config: AppConfig;
}

export class TaskService {
  private readonly taskModel: TaskModel;
  private readonly selectionService: SelectionService;
  private readonly workflowService: WorkflowService;
  private readonly plannerService: PlannerService;
  private readonly executionService: ExecutionService;
  private readonly notificationService: NotificationService;
  private readonly auditService: AuditService;
  private readonly completionDocumentService: CompletionDocumentService;
  private readonly config: AppConfig;

  constructor({
    taskModel,
    selectionService,
    workflowService,
    plannerService,
    executionService,
    notificationService,
    auditService,
    completionDocumentService,
    config,
  }: TaskServiceOptions) {
    this.taskModel = taskModel;
    this.selectionService = selectionService;
    this.workflowService = workflowService;
    this.plannerService = plannerService;
    this.executionService = executionService;
    this.notificationService = notificationService;
    this.auditService = auditService;
    this.completionDocumentService = completionDocumentService;
    this.config = config;
  }

  async create(sessionId: string | ObjectId): Promise<TaskDocument> {
    const workflow = await this.selectionService.getMatchedWorkflow(sessionId);
    const record = await this.workflowService.getRecord(workflow.workflow_id);
    const { requirements, steps } = this.plannerService.compile(workflow);

    const seq = await this.taskModel.nextSequence();
    const reference = buildReference(seq);

    const now = new Date();
    const inserted = await this.taskModel.insert({
      reference,
      session_id: String(sessionId),
      workflow_id: record.workflow_id,
      version: record.version,
      status: TASK_STATUS.COLLECTING,
      requirements,
      values: {},
      steps,
      audit: [{ type: "task_created", detail: null, created_at: now }],
      completion_document: null,
      created_at: now,
      updated_at: now,
    });

    logger.info("task created", { id: String(inserted._id), reference });
    return inserted;
  }

  async get(id: string | ObjectId): Promise<TaskDocument> {
    const task = await this.taskModel.findById(id);
    if (!task) throw NotFoundError.of("Task", String(id));
    return task;
  }

  async nextRequirement(id: string | ObjectId): Promise<NextRequirementDto> {
    const task = await this.get(id);

    const pendingRequired = task.requirements.find(
      (r) => r.status === REQUIREMENT_STATUS.PENDING && r.required,
    );
    if (pendingRequired) return { requirement: pendingRequired, complete: false };

    const pendingOptional = task.requirements.find((r) => r.status === REQUIREMENT_STATUS.PENDING);
    if (pendingOptional) return { requirement: pendingOptional, complete: false };

    return { requirement: null, complete: true };
  }

  async setValue(id: string | ObjectId, key: string, value: unknown): Promise<TaskDocument> {
    const task = await this.get(id);

    if (task.status !== TASK_STATUS.COLLECTING) {
      throw new ConflictError(`Task '${String(id)}' is not collecting values (status: ${task.status})`);
    }

    const requirementIndex = task.requirements.findIndex((r) => r.key === key);
    if (requirementIndex === -1) {
      throw new ValidationError(`Task '${String(id)}' has no requirement with key '${key}'`);
    }
    const requirement = task.requirements[requirementIndex]!;

    const coerced = validateValue(requirement, value, task.values);

    const updated = await this.taskModel.setValue(id, key, coerced, requirementIndex);
    if (!updated) throw NotFoundError.of("Task", String(id));

    return this.appendAudit(updated._id, "value_captured", key);
  }

  async finalize(id: string | ObjectId): Promise<TaskDocument> {
    const task = await this.get(id);

    if (task.status !== TASK_STATUS.COLLECTING) {
      throw new ConflictError(`Task '${String(id)}' is not collecting values (status: ${task.status})`);
    }

    const missing = task.requirements.filter((r) => r.required && r.status !== REQUIREMENT_STATUS.FILLED);
    if (missing.length > 0) {
      throw new ValidationError(
        `Task '${String(id)}' is missing required values: ${missing.map((r) => r.key).join(", ")}`,
      );
    }

    const isReopen = task.audit.some((entry) => entry.type === "more_info_requested");
    const steps = this.attachAssignees(task);

    if (isReopen) {
      const workflow = await this.workflowService.getDocument(task.workflow_id, task.version);
      const result = this.executionService.advance({ ...task, steps }, workflow);
      const stepsWithTokens = issueTokensForDispatched(
        String(task._id),
        result.steps,
        result.dispatched,
        this.config.mail.tokenSecret,
        this.config.mail.tokenTtlDays,
      );

      const updated = await this.taskModel.updateStepAndStatus(id, stepsWithTokens, TASK_STATUS.IN_PROGRESS);
      if (!updated) throw NotFoundError.of("Task", String(id));
      const finalized = await this.appendAudit(updated._id, "task_finalized", null);

      for (const stepId of result.dispatched) {
        const step = finalized.steps.find((s) => s.step_id === stepId);
        if (!step) continue;
        const sent = await this.notificationService.sendApprovalRequest(finalized, workflow, step);
        if (sent) {
          await this.taskModel.replaceSteps(
            finalized._id,
            finalized.steps.map((s) => (s.step_id === stepId ? { ...s, notified_at: new Date() } : s)),
          );
        }
      }

      return this.get(finalized._id);
    }

    const initializedSteps = this.initializeStepStates(steps);

    await this.taskModel.replaceSteps(id, initializedSteps);
    await this.taskModel.setStatus(id, TASK_STATUS.READY);
    const finalized = await this.appendAudit(id, "task_finalized", null);
    return finalized;
  }

  async start(id: string | ObjectId): Promise<TaskDocument> {
    const task = await this.get(id);

    if (task.status !== TASK_STATUS.READY) {
      throw new ConflictError(`Task '${String(id)}' is not ready to start (status: ${task.status})`);
    }

    const workflow = await this.workflowService.getDocument(task.workflow_id, task.version);
    const result = this.executionService.advance(task, workflow);
    const stepsWithTokens = issueTokensForDispatched(
      String(task._id),
      result.steps,
      result.dispatched,
      this.config.mail.tokenSecret,
      this.config.mail.tokenTtlDays,
    );

    const updated = await this.taskModel.updateStepAndStatus(id, stepsWithTokens, TASK_STATUS.IN_PROGRESS);
    if (!updated) throw NotFoundError.of("Task", String(id));

    const started = await this.appendAudit(updated._id, "task_started", null);

    for (const stepId of result.dispatched) {
      const step = started.steps.find((s) => s.step_id === stepId);
      if (!step) continue;
      const sent = await this.notificationService.sendApprovalRequest(started, workflow, step);
      if (sent) {
        await this.taskModel.replaceSteps(
          started._id,
          started.steps.map((s) => (s.step_id === stepId ? { ...s, notified_at: new Date() } : s)),
        );
      }
    }

    return this.get(started._id);
  }

  async getStatus(id: string | ObjectId): Promise<TaskStatusDto> {
    const task = await this.get(id);
    const workflow = await this.workflowService.getDocument(task.workflow_id, task.version);

    const currentSteps = task.steps
      .filter((s) => s.state === STEP_STATE.PENDING_APPROVAL)
      .map((s) => s.step_id);

    const rejectedStep =
      task.status === TASK_STATUS.REJECTED
        ? task.steps.find((s) => s.state === STEP_STATE.REJECTED) ?? null
        : null;

    const timeline: TaskTimelineEntry[] = task.steps
      .filter((s) => s.outcome !== null)
      .sort((a, b) => (a.responded_at?.getTime() ?? 0) - (b.responded_at?.getTime() ?? 0))
      .map((s) => ({
        step: workflow.steps.find((ws) => ws.id === s.step_id)?.name ?? s.step_id,
        outcome: s.outcome,
        reason: s.reason,
        at: s.responded_at as Date,
      }));

    return {
      status: task.status,
      reference: task.reference,
      workflow_title: workflow.title,
      current_steps: currentSteps,
      rejected_at_step: rejectedStep ? workflow.steps.find((ws) => ws.id === rejectedStep.step_id)?.name ?? rejectedStep.step_id : null,
      rejected_by: rejectedStep?.assignee?.name ?? null,
      reason: rejectedStep?.reason ?? null,
      timeline,
    };
  }

  /**
   * A completed task is immutable and its workflow is version-pinned, so the
   * PDF is never stored - it is re-rendered here from the persisted metadata
   * (D-4). A task that completed before `completion_document` existed, or
   * whose generation failed at completion time, gets one generated now and
   * backfilled. Drift between a fresh render and the stored hash is logged,
   * not raised - the stored `sha256` exists to make that drift visible.
   */
  async getDocument(id: string | ObjectId): Promise<RenderedDocument> {
    const task = await this.get(id);

    if (task.status !== TASK_STATUS.COMPLETED) {
      throw new ConflictError("A record is only issued once every step is approved");
    }

    const workflow = await this.workflowService.getDocument(task.workflow_id, task.version);
    const record = task.completion_document;
    const completedAt = record ? record.generated_at : task.updated_at;

    const document = await this.completionDocumentService.generate(task, workflow, completedAt);
    if (!document) {
      throw new ConflictError(`Task '${String(id)}' has no record available for download`);
    }

    if (!record) {
      await this.taskModel.setCompletionDocument(task._id, {
        generated_at: completedAt,
        filename: document.filename,
        byte_size: document.byteSize,
        sha256: document.sha256,
        emailed_to: null,
        emailed_at: null,
      });
    } else if (record.sha256 !== document.sha256) {
      logger.warn("completion document drift detected", {
        taskId: String(task._id),
        storedSha256: record.sha256,
        freshSha256: document.sha256,
      });
    }

    return document;
  }

  async reopenForMoreInfo(id: string | ObjectId, stepId: string, question: string): Promise<TaskDocument> {
    const task = await this.get(id);
    const step = task.steps.find((s) => s.step_id === stepId);
    if (!step) throw NotFoundError.of("Step", stepId);

    const requirement: TaskRequirement = {
      key: `followup:${stepId}:${step.reopen_count}`,
      source: "input",
      ref: stepId,
      label: question,
      description: null,
      type: "text",
      required: true,
      validation: null,
      collection_hint: null,
      status: REQUIREMENT_STATUS.PENDING,
    };

    const withRequirement = await this.taskModel.appendRequirement(id, requirement);
    if (!withRequirement) throw NotFoundError.of("Task", String(id));

    await this.taskModel.setStatus(id, TASK_STATUS.COLLECTING);
    const reopened = await this.appendAudit(id, "more_info_requested", stepId);

    const workflow = await this.workflowService.getDocument(reopened.workflow_id, reopened.version);
    await this.notificationService.sendMoreInfoNotice(reopened, workflow, step);

    return reopened;
  }

  async cancel(id: string | ObjectId): Promise<TaskDocument> {
    const task = await this.get(id);

    const terminal: TaskStatus[] = [TASK_STATUS.COMPLETED, TASK_STATUS.REJECTED, TASK_STATUS.CANCELLED];
    if (terminal.includes(task.status)) {
      throw new ConflictError(`Task '${String(id)}' is already in a terminal status (${task.status})`);
    }

    await this.taskModel.setStatus(id, TASK_STATUS.CANCELLED);
    return this.appendAudit(id, "task_cancelled", null);
  }

  /**
   * Hard-deletes a task nobody is waiting on, leaving an audit entry behind.
   *
   * What actually disqualifies a task is an approval link already sitting in
   * someone's inbox: deleting the task turns that link into a 404 with no
   * explanation. Two shapes are therefore safe to remove. A terminal task -
   * completed, rejected, cancelled - is finished business, and any link it left
   * behind is spent. A task still `collecting` that has never dispatched a step
   * is the other: nothing was ever sent, so there is nothing to orphan.
   *
   * The second rule is about DISPATCH, not status. A task reopened by
   * `request_more_info` is `collecting` again while its approvers still hold
   * live links, so `hasDispatchedStep` keeps it out. A requester who wants rid
   * of a request that is genuinely out for approval cancels it first - `cancel`
   * then makes it terminal and this becomes available.
   *
   * The audit entry is written BEFORE the delete so a failed delete still
   * leaves a record of the attempt rather than a silent gap.
   */
  async delete(id: string | ObjectId, actor: AuditActor, requestId?: string | null): Promise<void> {
    const task = await this.get(id);

    if (!TaskService.isDeletable(task)) {
      throw new ConflictError(
        `Task '${String(id)}' is still active (${task.status}) - cancel it before deleting`,
      );
    }

    await this.auditService.record({
      resource: "task",
      resourceId: String(task._id),
      action: "deleted",
      actor,
      snapshot: {
        reference: task.reference,
        workflow_id: task.workflow_id,
        version: task.version,
        status: task.status,
        created_at: task.created_at,
        step_outcomes: task.steps.map((step) => ({
          step_id: step.step_id,
          state: step.state,
          outcome: step.outcome,
        })),
      },
      requestId,
    });

    const deleted = await this.taskModel.deleteById(id);
    if (!deleted) throw NotFoundError.of("Task", String(id));

    logger.info("task deleted", { taskId: String(task._id), reference: task.reference, status: task.status });
  }

  countByWorkflow(workflowId: string, statuses?: TaskStatus[]): Promise<number> {
    return this.taskModel.countByWorkflow(workflowId, statuses);
  }

  list(filters: { session_id?: string; status?: TaskStatus }): Promise<TaskDocument[]> {
    return this.taskModel.findAll(filters);
  }

  /**
   * Whether `delete` will accept this task - see that method for the reasoning.
   *
   * Static so the rule stays one expression that callers can read, rather than
   * a status list they have to keep in step with the dispatch check.
   */
  static isDeletable(task: TaskDocument): boolean {
    const terminal: TaskStatus[] = [TASK_STATUS.COMPLETED, TASK_STATUS.REJECTED, TASK_STATUS.CANCELLED];
    if (terminal.includes(task.status)) return true;

    return task.status === TASK_STATUS.COLLECTING && !TaskService.hasDispatchedStep(task);
  }

  /**
   * Has any step left the building yet?
   *
   * All three signals are checked rather than just one: `approval_token` is the
   * link itself, `notified_at` records that the mail went out, and `outcome`
   * survives a step whose token has since been cleared. Any one of them means
   * an approver has seen this request.
   */
  private static hasDispatchedStep(task: TaskDocument): boolean {
    return task.steps.some(
      (step) => step.approval_token !== null || step.notified_at !== null || step.outcome !== null,
    );
  }

  private attachAssignees(task: TaskDocument): TaskStepState[] {
    const actorRequirements = task.requirements.filter((r) => r.source === "actor");

    return task.steps.map((step) => {
      const requirement = actorRequirements.find((r) => r.ref === step.step_id);
      if (!requirement) return step;

      const value = task.values[requirement.key];
      const assignee =
        value && typeof value === "object" && "name" in value && "email" in value ? value : null;

      return { ...step, assignee };
    });
  }

  private initializeStepStates(steps: TaskStepState[]): TaskStepState[] {
    return steps.map((step) => ({
      ...step,
      state: step.depends_on.length === 0 ? STEP_STATE.READY : STEP_STATE.BLOCKED,
    }));
  }

  private async appendAudit(
    id: string | ObjectId,
    type: string,
    detail: string | null,
  ): Promise<TaskDocument> {
    const updated = await this.taskModel.appendAudit(id, { type, detail, created_at: new Date() });
    if (!updated) throw NotFoundError.of("Task", String(id));
    return updated;
  }
}
