import type { ITaskModel } from "../models/task.model.js";
import type { TaskEffectExecutorService } from "./task-effect-executor.service.js";
import type { WorkflowTemplateService } from "./workflow-template.service.js";
import type { TaskConfig } from "../lib/types/config/config.type.js";
import type { TaskDocument } from "../lib/types/task/task-document.type.js";
import type { TaskEngineContext, TaskEngineResult } from "../lib/types/task/task-engine.type.js";
import type { WorkflowDefinition } from "../lib/types/workflow/workflow.type.js";

export interface TaskTransitionServiceOptions {
  taskModel: Pick<ITaskModel, "replaceWithRevision">;
  effectExecutor: Pick<TaskEffectExecutorService, "execute">;
  workflowTemplateService: Pick<WorkflowTemplateService, "getDefinition">;
  taskConfig: TaskConfig;
  now?: () => Date;
}

export class TaskTransitionService {
  private readonly taskModel: Pick<ITaskModel, "replaceWithRevision">;
  private readonly effectExecutor: Pick<TaskEffectExecutorService, "execute">;
  private readonly workflowTemplateService: Pick<WorkflowTemplateService, "getDefinition">;
  private readonly taskConfig: TaskConfig;
  private readonly clock: () => Date;

  constructor(options: TaskTransitionServiceOptions) {
    this.taskModel = options.taskModel;
    this.effectExecutor = options.effectExecutor;
    this.workflowTemplateService = options.workflowTemplateService;
    this.taskConfig = options.taskConfig;
    this.clock = options.now ?? (() => new Date());
  }

  now(): Date {
    return this.clock();
  }

  contextFor(definition: WorkflowDefinition): TaskEngineContext {
    return { definition, now: this.clock(), maxInformationRequestsPerStep: this.taskConfig.maxInformationRequestsPerStep };
  }

  async context(task: TaskDocument): Promise<TaskEngineContext> {
    return this.contextFor(await this.workflowTemplateService.getDefinition(task.workflow_template_id, task.workflow_template_version));
  }

  async save(task: TaskDocument, expectedRevision: number): Promise<TaskDocument> {
    return this.taskModel.replaceWithRevision({ ...task, updated_at: this.clock() }, expectedRevision);
  }

  async commit(result: TaskEngineResult, expectedRevision: number): Promise<TaskDocument> {
    const saved = await this.save(result.task, expectedRevision);
    return this.effectExecutor.execute(saved, result.effects);
  }
}
