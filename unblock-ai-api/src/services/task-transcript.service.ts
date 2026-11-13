import { buildTaskTranscript } from "../utils/document/task-transcript.util.js";
import { describeError } from "../utils/shared/error-description.util.js";
import { logger } from "../utils/shared/logger.util.js";
import type { IDocumentRenderer } from "./document/document.interface.js";
import type { WorkflowTemplateService } from "./workflow-template.service.js";
import type { DocumentConfig } from "../lib/types/config/config.type.js";
import type { RenderedDocument } from "../lib/types/document/document.type.js";
import type { TaskDocument } from "../lib/types/task/task-document.type.js";
import type { ITaskTranscriptRenderer } from "../lib/types/task/task-notification.type.js";
import type { WorkflowDefinition } from "../lib/types/workflow/workflow.type.js";

export interface TaskTranscriptServiceOptions {
  renderer: IDocumentRenderer;
  documentConfig: Pick<DocumentConfig, "enabled" | "institutionName">;
  workflowTemplateService: Pick<WorkflowTemplateService, "getDefinition">;
  now?: () => Date;
}

export class TaskTranscriptService implements ITaskTranscriptRenderer {
  private readonly renderer: IDocumentRenderer;
  private readonly documentConfig: Pick<DocumentConfig, "enabled" | "institutionName">;
  private readonly workflowTemplateService: Pick<WorkflowTemplateService, "getDefinition">;
  private readonly now: () => Date;

  constructor(options: TaskTranscriptServiceOptions) {
    this.renderer = options.renderer;
    this.documentConfig = options.documentConfig;
    this.workflowTemplateService = options.workflowTemplateService;
    this.now = options.now ?? (() => new Date());
  }

  async render(task: TaskDocument, definition: WorkflowDefinition): Promise<RenderedDocument | null> {
    if (!this.documentConfig.enabled) return null;
    try {
      const transcript = buildTaskTranscript(task, definition, { institutionName: this.documentConfig.institutionName, now: this.now() });
      return await this.renderer.render(transcript);
    } catch (err) {
      logger.error("transcript rendering failed", { taskId: String(task._id), error: describeError(err) });
      return null;
    }
  }

  async renderForTask(task: TaskDocument): Promise<RenderedDocument | null> {
    if (!this.documentConfig.enabled) return null;
    try {
      const definition = await this.workflowTemplateService.getDefinition(task.workflow_template_id, task.workflow_template_version);
      return await this.render(task, definition);
    } catch (err) {
      logger.error("transcript definition could not be loaded", { taskId: String(task._id), error: describeError(err) });
      return null;
    }
  }
}
