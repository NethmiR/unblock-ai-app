import { ObjectId } from "mongodb";
import { TaskCreationSource, TaskStatus, TERMINAL_TASK_STATUSES } from "../data/constants/task.constant.js";
import { taskNotDeletable, taskNotFound } from "../errors/task.error.js";
import { workflowTemplateNotEligible } from "../errors/workflow-template.error.js";
import { evaluateCandidateEligibility } from "../utils/selection/candidate-eligibility.util.js";
import { buildReference } from "../utils/task/reference.util.js";
import { logger } from "../utils/shared/logger.util.js";
import { audienceOf } from "./assignee-resolution.service.js";
import type { ITaskModel } from "../models/task.model.js";
import type { AuditService } from "./audit.service.js";
import type { OrganisationCatalogueService } from "./organisation-catalogue.service.js";
import type { RequesterProfileService } from "./requester-profile.service.js";
import type { SelectionService } from "./selection.service.js";
import type { TaskEngineService } from "./task-engine.service.js";
import type { TaskPlanService } from "./task-plan.service.js";
import type { TaskTransitionService } from "./task-transition.service.js";
import type { TaskEffectExecutorService } from "./task-effect-executor.service.js";
import type { WorkflowTemplateService } from "./workflow-template.service.js";
import type { AuditActor } from "../lib/types/audit/audit.type.js";
import type { RequesterProfile } from "../lib/types/requester/requester.type.js";
import type { CreateTaskInput, TaskListFilter, TaskListPage } from "../lib/types/task/task-dto.type.js";
import type { RequesterSnapshot, TaskConversationMessage, TaskDocument } from "../lib/types/task/task-document.type.js";
import type { WorkflowDefinition } from "../lib/types/workflow/workflow.type.js";

const AUDIT_RESOURCE_TASK = "task";
const AUDIT_ACTION_DELETED = "deleted";

export interface TaskServiceOptions {
  taskModel: ITaskModel;
  selectionService: Pick<SelectionService, "consumeMatch" | "delete">;
  workflowTemplateService: Pick<WorkflowTemplateService, "getPublishedDefinition" | "getDefinition">;
  requesterProfileService: Pick<RequesterProfileService, "getProfile">;
  organisationCatalogueService: Pick<OrganisationCatalogueService, "getCatalogue">;
  taskPlanService: Pick<TaskPlanService, "compile">;
  taskEngine: Pick<TaskEngineService, "start" | "cancel">;
  transitions: Pick<TaskTransitionService, "context" | "contextFor" | "commit" | "now">;
  effectExecutor: Pick<TaskEffectExecutorService, "execute">;
  auditService: Pick<AuditService, "record">;
}

function requesterSnapshot(profile: RequesterProfile): RequesterSnapshot {
  return {
    user_id: profile.userId,
    full_name: profile.fullName,
    email: profile.email,
    units: profile.units.map(({ unit, parent, designations }) => ({
      id: unit.id,
      code: unit.code,
      name: unit.name,
      unit_type: unit.unitType,
      parent_name: parent?.name ?? null,
      designation_titles: designations.map((designation) => designation.title),
    })),
  };
}

export class TaskService {
  private readonly options: TaskServiceOptions;

  constructor(options: TaskServiceOptions) {
    this.options = options;
  }

  static isDeletable(task: TaskDocument): boolean {
    if (TERMINAL_TASK_STATUSES.includes(task.status)) return true;
    return !task.steps.some(
      (step) => step.approval !== null && (step.approval.token_hash !== null || step.approval.notified_at !== null || step.approval.decision !== null),
    );
  }

  async create(userId: string, input: CreateTaskInput): Promise<TaskDocument> {
    const { selectionService, workflowTemplateService, requesterProfileService, organisationCatalogueService } = this.options;
    let workflowTemplateId: string;
    let conversation: TaskConversationMessage[] = [];
    if (input.source === TaskCreationSource.SELECTION_SESSION) {
      const match = await selectionService.consumeMatch(input.selectionSessionId, userId);
      workflowTemplateId = match.workflowTemplateId;
      conversation = match.conversation;
    } else {
      workflowTemplateId = input.workflowTemplateId;
    }

    const { version, definition } = await workflowTemplateService.getPublishedDefinition(workflowTemplateId);
    const [profile, catalogue] = await Promise.all([requesterProfileService.getProfile(userId), organisationCatalogueService.getCatalogue()]);
    if (!evaluateCandidateEligibility(audienceOf(definition), profile, catalogue).eligible) throw workflowTemplateNotEligible(workflowTemplateId);

    const plan = await this.options.taskPlanService.compile(definition, profile, catalogue);
    const now = this.options.transitions.now();
    const draft: TaskDocument = {
      _id: new ObjectId(),
      reference: buildReference(await this.options.taskModel.nextSequence(now), now),
      revision: 0,
      created_by: userId,
      requester: requesterSnapshot(profile),
      workflow_template_id: workflowTemplateId,
      workflow_template_version: version,
      title: definition.title,
      status: TaskStatus.IN_PROGRESS,
      creation_source: input.source,
      conversation,
      steps: plan.steps,
      forms: plan.forms,
      values: plan.values,
      unsupported_inputs: plan.unsupported_inputs,
      audit: [],
      created_at: now,
      updated_at: now,
      completed_at: null,
    };
    const started = this.options.taskEngine.start(draft, this.options.transitions.contextFor(definition));
    const inserted = await this.options.taskModel.insert(started.task);
    const executed = await this.options.effectExecutor.execute(inserted, started.effects);
    if (input.source === TaskCreationSource.SELECTION_SESSION) await selectionService.delete(input.selectionSessionId);
    logger.info("task created", { taskId: String(inserted._id), reference: inserted.reference, workflowTemplateId });
    return executed;
  }

  async get(id: string): Promise<TaskDocument> {
    const task = await this.options.taskModel.findById(id);
    if (!task) throw taskNotFound(id);
    return task;
  }

  list(userId: string, filter: TaskListFilter): Promise<TaskListPage<TaskDocument>> {
    return this.options.taskModel.findOwnedSummaryPage(userId, filter);
  }

  async getWorkflowDefinition(id: string): Promise<WorkflowDefinition> {
    const task = await this.get(id);
    return this.options.workflowTemplateService.getDefinition(task.workflow_template_id, task.workflow_template_version);
  }

  async cancel(id: string): Promise<TaskDocument> {
    const task = await this.get(id);
    const result = this.options.taskEngine.cancel(task, await this.options.transitions.context(task));
    return this.options.transitions.commit(result, task.revision);
  }

  async delete(id: string, actor: AuditActor, requestId: string | null = null): Promise<void> {
    const task = await this.get(id);
    if (!TaskService.isDeletable(task)) throw taskNotDeletable();

    await this.options.auditService.record({
      resource: AUDIT_RESOURCE_TASK,
      resourceId: String(task._id),
      action: AUDIT_ACTION_DELETED,
      actor,
      snapshot: {
        reference: task.reference,
        title: task.title,
        workflow_template_id: task.workflow_template_id,
        workflow_template_version: task.workflow_template_version,
        status: task.status,
        created_at: task.created_at,
        step_outcomes: task.steps.map((step) => ({ step_id: step.id, status: step.status, outcome: step.outcome })),
      },
      requestId,
    });
    if (!(await this.options.taskModel.deleteById(id))) throw taskNotFound(id);
    logger.info("task deleted", { taskId: id, reference: task.reference, status: task.status });
  }

  async isOwnedBy(id: string, userId: string): Promise<boolean> {
    return (await this.options.taskModel.findCreatorById(id)) === userId;
  }
}
