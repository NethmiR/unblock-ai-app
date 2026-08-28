import { buildCompletionDocument } from "../utils/document/completion-document.util.js";
import { evaluateComputed } from "../utils/workflow/computed-evaluator.util.js";
import { logger } from "../utils/shared/logger.util.js";
import type { IDocumentRenderer } from "./document/document.interface.js";
import type { AppConfig } from "../lib/types/config/config.type.js";
import type { TaskDocument } from "../lib/types/task/task.type.js";
import type { WorkflowDefinition } from "../lib/types/workflow/workflow.type.js";
import type { RenderedDocument } from "../lib/types/document/document.type.js";

export interface CompletionDocumentServiceOptions {
  renderer: IDocumentRenderer;
  config: AppConfig;
}

export class CompletionDocumentService {
  private readonly renderer: IDocumentRenderer;
  private readonly config: AppConfig;

  constructor({ renderer, config }: CompletionDocumentServiceOptions) {
    this.renderer = renderer;
    this.config = config;
  }

  /** Never throws. Returns null when disabled or when rendering fails. */
  async generate(
    task: TaskDocument,
    workflow: WorkflowDefinition,
    completedAt: Date,
  ): Promise<RenderedDocument | null> {
    if (!this.config.document.enabled) return null;

    try {
      const computed = evaluateComputed(workflow, task.values);
      const document = buildCompletionDocument(task, workflow, {
        institutionName: this.config.document.institutionName,
        completedAt,
        computed,
      });
      return await this.renderer.render(document);
    } catch (error) {
      logger.error("completion document generation failed", {
        taskId: String(task._id),
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
