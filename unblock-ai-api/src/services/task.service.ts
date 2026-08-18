import type { ObjectId } from "mongodb";
import { TaskModel } from "../models/task.model.js";
import { SelectionService } from "./selection.service.js";
import { WorkflowService } from "./workflow.service.js";
import { PlannerService } from "./planner.service.js";
import { ExecutionService } from "./execution.service.js";
import { NotificationService } from "./notification.service.js";
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
import type { RequirementValue } from "../lib/types/task/requirement.type.js";
import type { TaskStatusDto, TaskTimelineEntry } from "../lib/types/approval/approval.type.js";

export interface TaskServiceOptions {
  taskModel: TaskModel;
  selectionService: SelectionService;
  workflowService: WorkflowService;
  plannerService: PlannerService;
  executionService: ExecutionService;
  notificationService: NotificationService;
  config: AppConfig;
}

export class TaskService {
  private readonly taskModel: TaskModel;
  private readonly selectionService: SelectionService;
  private readonly workflowService: WorkflowService;
  private readonly plannerService: PlannerService;
  private readonly executionService: ExecutionService;
  private readonly notificationService: NotificationService;
  private readonly config: AppConfig;

  constructor({
    taskModel,
    selectionService,
    workflowService,
    plannerService,
    executionService,
    notificationService,
    config,
  }: TaskServiceOptions) {
    this.taskModel = taskModel;
    this.selectionService = selectionService;
    this.workflowService = workflowService;
    this.plannerService = plannerService;
    this.executionService = executionService;
    this.notificationService = notificationService;
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

    const steps = this.attachAssignees(task);
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

  async cancel(id: string | ObjectId): Promise<TaskDocument> {
    const task = await this.get(id);

    const terminal: TaskStatus[] = [TASK_STATUS.COMPLETED, TASK_STATUS.REJECTED, TASK_STATUS.CANCELLED];
    if (terminal.includes(task.status)) {
      throw new ConflictError(`Task '${String(id)}' is already in a terminal status (${task.status})`);
    }

    await this.taskModel.setStatus(id, TASK_STATUS.CANCELLED);
    return this.appendAudit(id, "task_cancelled", null);
  }

  list(filters: { session_id?: string; status?: TaskStatus }): Promise<TaskDocument[]> {
    return this.taskModel.findAll(filters);
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
