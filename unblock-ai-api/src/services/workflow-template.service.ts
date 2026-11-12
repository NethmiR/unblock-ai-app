import { randomUUID } from "node:crypto";
import { WorkflowTemplateModel } from "../models/workflow-template.model.js";
import { WorkflowTemplateVersionModel } from "../models/workflow-template-version.model.js";
import { EmbeddingService } from "./embedding.service.js";
import { WorkflowTemplateGenerationService } from "./workflow-template-generation.service.js";
import { WorkflowTemplateStatus, WorkflowTemplateVisibility } from "../data/constants/workflow-template.constant.js";
import { renderAliasesLower, renderForEmbedding } from "../utils/retrieval/render-summary.util.js";
import {
  normaliseWorkflowTemplatePrompt,
  normaliseWorkflowTemplateTitle,
  toGeneratedWorkflowTemplateTitle,
} from "../utils/workflow-template/workflow-template-input.util.js";
import { logger } from "../utils/shared/logger.util.js";
import { ValidationError } from "../errors/validation.error.js";
import {
  workflowTemplateAlreadyPublished,
  workflowTemplateArchived,
  workflowTemplateNotArchived,
  workflowTemplateNotFound,
  workflowTemplateNotGenerated,
  workflowTemplateNotPublished,
  workflowTemplateVersionNotFound,
} from "../errors/workflow-template.error.js";
import type { IUserRepository } from "../repositories/user-repository/user-repository.interface.js";
import type { RetrievalSummary } from "../lib/types/workflow/retrieval-summary.type.js";
import type { WorkflowDefinition } from "../lib/types/workflow/workflow.type.js";
import type {
  CreateWorkflowTemplateDraftInput,
  GeneratedWorkflowTemplate,
  GenerateWorkflowTemplateInput,
  PublishedWorkflowDefinition,
  UpdateWorkflowTemplateInput,
  UserReferenceLookup,
  WorkflowTemplateDetail,
  WorkflowTemplateDocument,
  WorkflowTemplateList,
  WorkflowTemplateListOptions,
  WorkflowTemplateRetrieval,
  WorkflowTemplateVersionDetail,
  WorkflowTemplateVersionDocument,
  WorkflowTemplateVersionList,
} from "../lib/types/workflow-template/workflow-template.type.js";

type TemplateChanges = Partial<Omit<WorkflowTemplateDocument, "_id" | "created_by" | "created_at">>;

export interface WorkflowTemplateServiceOptions {
  workflowTemplateModel: WorkflowTemplateModel;
  workflowTemplateVersionModel: WorkflowTemplateVersionModel;
  generationService: WorkflowTemplateGenerationService;
  embeddingService: EmbeddingService;
  userRepository: IUserRepository;
}

export class WorkflowTemplateService {
  private readonly workflowTemplateModel: WorkflowTemplateModel;
  private readonly workflowTemplateVersionModel: WorkflowTemplateVersionModel;
  private readonly generationService: WorkflowTemplateGenerationService;
  private readonly embeddingService: EmbeddingService;
  private readonly userRepository: IUserRepository;

  constructor({
    workflowTemplateModel,
    workflowTemplateVersionModel,
    generationService,
    embeddingService,
    userRepository,
  }: WorkflowTemplateServiceOptions) {
    this.workflowTemplateModel = workflowTemplateModel;
    this.workflowTemplateVersionModel = workflowTemplateVersionModel;
    this.generationService = generationService;
    this.embeddingService = embeddingService;
    this.userRepository = userRepository;
  }

  async list(options: WorkflowTemplateListOptions): Promise<WorkflowTemplateList> {
    const templates = await this.workflowTemplateModel.findAll(options);
    const users = await this.lookupUsers(templates.flatMap((template) => [template.created_by, template.updated_by]));
    return { templates, users };
  }

  async get(id: string, visibility: WorkflowTemplateVisibility): Promise<WorkflowTemplateDetail> {
    return this.toDetail(await this.requireVisible(id, visibility));
  }

  async listVersions(id: string, visibility: WorkflowTemplateVisibility): Promise<WorkflowTemplateVersionList> {
    await this.requireVisible(id, visibility);
    const versions = await this.workflowTemplateVersionModel.listSummaries(id);
    const users = await this.lookupUsers(versions.map((version) => version.created_by));
    return { versions, users };
  }

  async getVersion(id: string, version: number, visibility: WorkflowTemplateVisibility): Promise<WorkflowTemplateVersionDetail> {
    await this.requireVisible(id, visibility);
    const found = await this.requireVersion(id, version);
    return { version: found, users: await this.lookupUsers([found.created_by]) };
  }

  async getDefinition(id: string, version: number): Promise<WorkflowDefinition> {
    const template = await this.requireTemplate(id);
    const found = await this.requireVersion(id, version);
    return { ...found.definition, title: template.title };
  }

  async getPublishedDefinition(id: string): Promise<PublishedWorkflowDefinition> {
    const template = await this.requireTemplate(id);
    if (template.status !== WorkflowTemplateStatus.PUBLISHED || template.archived_at !== null || template.current_version === null) {
      throw workflowTemplateNotPublished(id);
    }
    const found = await this.requireVersion(id, template.current_version);
    return { version: found.version, definition: { ...found.definition, title: template.title } };
  }

  async createDraft(input: CreateWorkflowTemplateDraftInput, actorId: string): Promise<WorkflowTemplateDetail> {
    const now = new Date();
    const template = await this.workflowTemplateModel.insert({
      _id: randomUUID(),
      title: normaliseWorkflowTemplateTitle(input.title),
      description: null,
      status: WorkflowTemplateStatus.DRAFT,
      draft_prompt: normaliseWorkflowTemplatePrompt(input.prompt),
      current_version: null,
      retrieval: null,
      created_by: actorId,
      updated_by: actorId,
      archived_at: null,
      created_at: now,
      updated_at: now,
    });
    logger.info("workflow template draft created", { workflowTemplateId: template._id });
    return this.toDetail(template);
  }

  async generateNew(input: GenerateWorkflowTemplateInput, actorId: string): Promise<WorkflowTemplateDetail> {
    const prompt = normaliseWorkflowTemplatePrompt(input.prompt);
    const requestedTitle = input.title === null ? null : normaliseWorkflowTemplateTitle(input.title);
    const generated = await this.generationService.generate(prompt);
    const title = requestedTitle ?? toGeneratedWorkflowTemplateTitle(generated.title);
    const retrieval = await this.buildRetrieval(title, generated.definition.retrieval_summary, generated.definition.scope.institution_type);

    const id = randomUUID();
    const now = new Date();
    const version = await this.insertVersion(id, 1, prompt, generated, actorId, now);
    const template = await this.workflowTemplateModel.insert({
      _id: id,
      title,
      description: generated.definition.description,
      status: WorkflowTemplateStatus.UNPUBLISHED,
      draft_prompt: null,
      current_version: version.version,
      retrieval,
      created_by: actorId,
      updated_by: actorId,
      archived_at: null,
      created_at: now,
      updated_at: now,
    });
    logger.info("workflow template generated", { workflowTemplateId: id, version: version.version });
    return this.toDetail(template, version);
  }

  async regenerate(id: string, input: GenerateWorkflowTemplateInput, actorId: string): Promise<WorkflowTemplateDetail> {
    const template = await this.requireEditable(id);
    const prompt = normaliseWorkflowTemplatePrompt(input.prompt);
    const title = input.title === null ? template.title : normaliseWorkflowTemplateTitle(input.title);
    const generated = await this.generationService.generate(prompt);
    const retrieval = await this.buildRetrieval(
      title,
      generated.definition.retrieval_summary,
      generated.definition.scope.institution_type,
    );

    const now = new Date();
    const version = await this.insertVersion(id, (template.current_version ?? 0) + 1, prompt, generated, actorId, now);
    const updated = await this.applyChanges(id, actorId, {
      title,
      description: generated.definition.description,
      status: template.status === WorkflowTemplateStatus.DRAFT ? WorkflowTemplateStatus.UNPUBLISHED : template.status,
      draft_prompt: null,
      current_version: version.version,
      retrieval,
    }, now);
    logger.info("workflow template regenerated", { workflowTemplateId: id, version: version.version, status: updated.status });
    return this.toDetail(updated, version);
  }

  async update(id: string, input: UpdateWorkflowTemplateInput, actorId: string): Promise<WorkflowTemplateDetail> {
    const template = await this.requireEditable(id);
    const changes: TemplateChanges = {};

    if (input.title !== undefined) {
      const title = normaliseWorkflowTemplateTitle(input.title);
      if (title !== template.title) {
        changes.title = title;
        if (template.retrieval) {
          changes.retrieval = await this.buildRetrieval(title, template.retrieval.retrieval_summary, template.retrieval.institution_type);
        }
      }
    }

    if (input.draftPrompt !== undefined) {
      const draftPrompt = await this.resolveDraftPrompt(template, input.draftPrompt);
      if (draftPrompt !== template.draft_prompt) changes.draft_prompt = draftPrompt;
    }

    if (Object.keys(changes).length === 0) return this.toDetail(template);
    return this.toDetail(await this.applyChanges(id, actorId, changes));
  }

  async publish(id: string, actorId: string): Promise<WorkflowTemplateDetail> {
    const template = await this.requireEditable(id);
    if (template.status === WorkflowTemplateStatus.DRAFT) throw workflowTemplateNotGenerated();
    if (template.status === WorkflowTemplateStatus.PUBLISHED) throw workflowTemplateAlreadyPublished();
    const updated = await this.applyChanges(id, actorId, { status: WorkflowTemplateStatus.PUBLISHED });
    logger.info("workflow template published", { workflowTemplateId: id, version: updated.current_version });
    return this.toDetail(updated);
  }

  async archive(id: string, actorId: string): Promise<WorkflowTemplateDetail> {
    const template = await this.requireTemplate(id);
    if (template.archived_at !== null) throw workflowTemplateArchived();
    const now = new Date();
    return this.toDetail(await this.applyChanges(id, actorId, { archived_at: now }, now));
  }

  async restore(id: string, actorId: string): Promise<WorkflowTemplateDetail> {
    const template = await this.requireTemplate(id);
    if (template.archived_at === null) throw workflowTemplateNotArchived();
    return this.toDetail(await this.applyChanges(id, actorId, { archived_at: null }));
  }

  private async resolveDraftPrompt(template: WorkflowTemplateDocument, draftPrompt: string | null): Promise<string | null> {
    if (draftPrompt === null) {
      if (template.status === WorkflowTemplateStatus.DRAFT) {
        throw new ValidationError("A draft workflow template must keep its prompt", { details: { field: "draft_prompt" } });
      }
      return null;
    }

    const prompt = normaliseWorkflowTemplatePrompt(draftPrompt);
    if (template.current_version === null) return prompt;
    const current = await this.requireVersion(template._id, template.current_version);
    return current.prompt === prompt ? null : prompt;
  }

  private async buildRetrieval(title: string, summary: RetrievalSummary, institutionType: string): Promise<WorkflowTemplateRetrieval> {
    const text = renderForEmbedding(title, summary);
    return {
      text,
      embedding: await this.embeddingService.embedDocument(text),
      aliases_lower: renderAliasesLower(summary),
      retrieval_summary: summary,
      institution_type: institutionType,
      ...this.embeddingService.metadata(),
    };
  }

  private insertVersion(
    id: string,
    version: number,
    prompt: string,
    generated: GeneratedWorkflowTemplate,
    actorId: string,
    now: Date,
  ): Promise<WorkflowTemplateVersionDocument> {
    return this.workflowTemplateVersionModel.insert({
      workflow_template_id: id,
      version,
      prompt,
      definition: generated.definition,
      generation_attempts: generated.attempts,
      created_by: actorId,
      created_at: now,
    });
  }

  private async applyChanges(
    id: string,
    actorId: string,
    changes: TemplateChanges,
    now: Date = new Date(),
  ): Promise<WorkflowTemplateDocument> {
    const updated = await this.workflowTemplateModel.update(id, { ...changes, updated_by: actorId, updated_at: now });
    if (!updated) throw workflowTemplateNotFound(id);
    return updated;
  }

  private async requireTemplate(id: string): Promise<WorkflowTemplateDocument> {
    const template = await this.workflowTemplateModel.findById(id);
    if (!template) throw workflowTemplateNotFound(id);
    return template;
  }

  private async requireVisible(id: string, visibility: WorkflowTemplateVisibility): Promise<WorkflowTemplateDocument> {
    const template = await this.requireTemplate(id);
    if (visibility === WorkflowTemplateVisibility.PUBLISHED && template.status !== WorkflowTemplateStatus.PUBLISHED) {
      throw workflowTemplateNotFound(id);
    }
    return template;
  }

  private async requireEditable(id: string): Promise<WorkflowTemplateDocument> {
    const template = await this.requireTemplate(id);
    if (template.archived_at !== null) throw workflowTemplateArchived();
    return template;
  }

  private async requireVersion(id: string, version: number): Promise<WorkflowTemplateVersionDocument> {
    const found = await this.workflowTemplateVersionModel.find(id, version);
    if (!found) throw workflowTemplateVersionNotFound(id, version);
    return found;
  }

  private async toDetail(
    template: WorkflowTemplateDocument,
    knownVersion?: WorkflowTemplateVersionDocument,
  ): Promise<WorkflowTemplateDetail> {
    const currentVersion =
      knownVersion ?? (template.current_version === null ? null : await this.requireVersion(template._id, template.current_version));
    const userIds = [template.created_by, template.updated_by, ...(currentVersion ? [currentVersion.created_by] : [])];
    return { template, currentVersion, users: await this.lookupUsers(userIds) };
  }

  private async lookupUsers(ids: readonly string[]): Promise<UserReferenceLookup> {
    const references = await this.userRepository.findReferencesByIds([...new Set(ids)]);
    return new Map(references.map((reference) => [reference.id, reference]));
  }
}
