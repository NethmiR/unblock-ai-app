import type { ObjectId } from "mongodb";
import { TaskModel } from "../models/task.model.js";
import { SelectionService } from "./selection.service.js";
import { WorkflowService } from "./workflow.service.js";
import { PlannerService } from "./planner.service.js";
import { validateValue } from "../utils/task/value-validator.util.js";
import { buildReference } from "../utils/task/reference.util.js";
import { logger } from "../utils/shared/logger.util.js";
import { TASK_STATUS, REQUIREMENT_STATUS, STEP_STATE } from "../data/constants/status.constant.js";
import { ConflictError } from "../errors/conflict.error.js";
import { ValidationError } from "../errors/validation.error.js";
import { NotFoundError } from "../errors/not-found.error.js";
import type { TaskDocument, TaskStatus, TaskStepState } from "../lib/types/task/task.type.js";
import type { NextRequirementDto } from "../lib/types/task/task.type.js";
import type { RequirementValue } from "../lib/types/task/requirement.type.js";

export interface TaskServiceOptions {
  taskModel: TaskModel;
  selectionService: SelectionService;
  workflowService: WorkflowService;
  plannerService: PlannerService;
}

export class TaskService {
  private readonly taskModel: TaskModel;
  private readonly selectionService: SelectionService;
  private readonly workflowService: WorkflowService;
  private readonly plannerService: PlannerService;

  constructor({ taskModel, selectionService, workflowService, plannerService }: TaskServiceOptions) {
    this.taskModel = taskModel;
    this.selectionService = selectionService;
    this.workflowService = workflowService;
    this.plannerService = plannerService;
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
