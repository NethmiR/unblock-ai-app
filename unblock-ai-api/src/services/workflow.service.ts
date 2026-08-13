import type { ObjectId } from "mongodb";
import { TemplateModel } from "../models/template.model.js";
import { EmbeddingService } from "./embedding.service.js";
import { ValidationService } from "./validation.service.js";
import { renderForEmbedding, renderAliasesLower } from "../utils/retrieval/render-summary.util.js";
import { serializeTemplateSummary } from "../utils/http/serializer.util.js";
import { logger } from "../utils/shared/logger.util.js";
import { REVIEW_STATUS } from "../data/constants/status.constant.js";
import { NotFoundError } from "../errors/not-found.error.js";
import type { ReviewStatus, WorkflowDefinition } from "../lib/types/workflow/workflow.type.js";
import type { SaveResult, TemplateDocument, TemplateSummary } from "../lib/types/template/template.type.js";

export interface WorkflowServiceOptions {
  templateModel: TemplateModel;
  embeddingService: EmbeddingService;
  validationService: ValidationService;
}

export interface SaveOptions {
  draftId?: ObjectId | null;
}

export class WorkflowService {
  private readonly templateModel: TemplateModel;
  private readonly embeddingService: EmbeddingService;
  private readonly validationService: ValidationService;

  constructor({ templateModel, embeddingService, validationService }: WorkflowServiceOptions) {
    this.templateModel = templateModel;
    this.embeddingService = embeddingService;
    this.validationService = validationService;
  }

  async save(workflow: WorkflowDefinition, options: SaveOptions = {}): Promise<SaveResult> {
    const workflowId = workflow.workflow_id;
    const version = (await this.templateModel.findLatestVersionNumber(workflowId)) + 1;

    const text = renderForEmbedding(workflow);
    const embedding = await this.embeddingService.embedDocument(text);

    const now = new Date();
    const doc: Omit<TemplateDocument, "_id"> = {
      workflow_id: workflowId,
      version,
      draft_id: options.draftId ?? null,
      title: workflow.title,
      description: workflow.description,
      institution_type: workflow.scope?.institution_type ?? null,
      schema_version: workflow.schema_version,
      // TODO(admin-approval): defaulting to CONFIRMED so templates are selectable
      // immediately after extraction, skipping manual review. Revert this default
      // to REVIEW_STATUS.PENDING once the admin "Publish" approval flow ships.
      review_status: (workflow.metadata?.review_status as ReviewStatus | undefined) ?? REVIEW_STATUS.CONFIRMED,
      document: workflow,
      is_latest: true,
      retrieval: {
        text,
        embedding,
        aliases_lower: renderAliasesLower(workflow),
        ...this.embeddingService.metadata(),
      },
      created_at: now,
      updated_at: now,
    };

    await this.templateModel.demoteLatest(workflowId, now);
    await this.templateModel.insert(doc);

    logger.info("template saved", { workflowId, version, embedded: true });
    return { id: workflowId, version };
  }

  update(workflowId: string, workflow: WorkflowDefinition, options: SaveOptions = {}): Promise<SaveResult> {
    return this.save({ ...workflow, workflow_id: workflowId }, options);
  }

  async getDocument(workflowId: string, version?: number): Promise<WorkflowDefinition> {
    const record = await this.templateModel.findOneByIdAndVersion(workflowId, version);
    if (!record) throw NotFoundError.of("Workflow", workflowId);
    return record.document;
  }

  async getRecord(workflowId: string, version?: number): Promise<TemplateDocument> {
    const record = await this.templateModel.findOneByIdAndVersion(workflowId, version);
    if (!record) throw NotFoundError.of("Workflow", workflowId);
    return record;
  }

  async list(filters: { institution_type?: string; review_status?: string }): Promise<TemplateSummary[]> {
    const docs = await this.templateModel.findAll(filters);
    return docs.map(serializeTemplateSummary);
  }

  async search(query: string): Promise<TemplateSummary[]> {
    const needle = query.trim();
    if (!needle) return [];
    const docs = await this.templateModel.searchByText(needle);
    return docs.map(serializeTemplateSummary);
  }

  async setReviewStatus(
    workflowId: string,
    version: number,
    reviewStatus: ReviewStatus,
  ): Promise<TemplateSummary | null> {
    const result = await this.templateModel.updateReviewStatus(workflowId, version, reviewStatus);
    return result ? serializeTemplateSummary(result) : null;
  }
}
