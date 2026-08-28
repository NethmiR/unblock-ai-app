import type { ObjectId } from "mongodb";
import { TemplateModel } from "../models/template.model.js";
import { TaskModel } from "../models/task.model.js";
import { EmbeddingService } from "./embedding.service.js";
import { ValidationService } from "./validation.service.js";
import { DeletionLogService } from "./deletion-log.service.js";
import { renderForEmbedding, renderAliasesLower } from "../utils/retrieval/render-summary.util.js";
import { serializeTemplateSummary } from "../utils/http/serializer.util.js";
import { logger } from "../utils/shared/logger.util.js";
import { REVIEW_STATUS, TASK_STATUS } from "../data/constants/status.constant.js";
import { NotFoundError } from "../errors/not-found.error.js";
import { ConflictError } from "../errors/conflict.error.js";
import { ValidationError } from "../errors/validation.error.js";
import type { ReviewStatus, WorkflowDefinition } from "../lib/types/workflow/workflow.type.js";
import type { SaveResult, TemplateDocument, TemplateSummary } from "../lib/types/template/template.type.js";
import type { AuthUser, TemplateDeletionRecord } from "../lib/types/auth/auth.type.js";
import type { TaskStatus } from "../lib/types/task/task.type.js";

/** Long enough for a real institutional process name, short enough to stay a title. */
export const MAX_TITLE_LENGTH = 200;

export interface WorkflowServiceOptions {
  templateModel: TemplateModel;
  embeddingService: EmbeddingService;
  validationService: ValidationService;
  /**
   * Read directly rather than through TaskService: TaskService already depends
   * on this service, so taking it as a dependency here would close a cycle.
   */
  taskModel: TaskModel;
  deletionLog: DeletionLogService;
}

export interface SaveOptions {
  draftId?: ObjectId | null;
}

export class WorkflowService {
  private readonly templateModel: TemplateModel;
  private readonly embeddingService: EmbeddingService;
  private readonly validationService: ValidationService;
  private readonly taskModel: TaskModel;
  private readonly deletionLog: DeletionLogService;

  constructor({
    templateModel,
    embeddingService,
    validationService,
    taskModel,
    deletionLog,
  }: WorkflowServiceOptions) {
    this.templateModel = templateModel;
    this.embeddingService = embeddingService;
    this.validationService = validationService;
    this.taskModel = taskModel;
    this.deletionLog = deletionLog;
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

  /**
   * Renames a template WITHOUT recompiling it.
   *
   * No re-extraction is needed: `title` is a leaf field of the compiled
   * document, so every step, condition, and actor the last compilation produced
   * is still exactly right. Two things do have to happen, and neither is
   * optional:
   *
   * - **Re-embed.** `renderForEmbedding` opens the embedded text with the
   *   title, so the stored vector goes stale the instant the title moves. Skip
   *   this and retrieval keeps matching requesters against the old name.
   * - **Stay on the same version.** Versions record compilations of the prose;
   *   forking one for a rename would make the version number stop meaning that.
   *
   * `workflow_id` is deliberately left alone. Tasks reference it, so a rename
   * must never orphan a request that is already in flight.
   *
   * What this canNOT fix is the rest of the retrieval summary: `aliases` and
   * `keywords` were written by the model from the draft prose and may still
   * name the old process. Renaming to something genuinely different is a cue to
   * edit the prose and regenerate - the admin editor says so after a rename.
   */
  async rename(workflowId: string, title: string, version?: number): Promise<TemplateSummary> {
    const record = await this.getRecord(workflowId, version);

    // A title is one line wherever it is shown - the editor heading, the list,
    // the delete confirmation. Normalise here too so a direct API call cannot
    // store a newline that only that one caller knows about.
    const next = title.trim().replace(/\s+/g, " ");
    if (!next) throw new ValidationError("Template title cannot be empty");
    if (next.length > MAX_TITLE_LENGTH) {
      throw new ValidationError(`Template title must be ${MAX_TITLE_LENGTH} characters or fewer`);
    }
    if (next === record.title) return serializeTemplateSummary(record);

    const document = { ...record.document, title: next };
    const text = renderForEmbedding(document);
    const embedding = await this.embeddingService.embedDocument(text);

    const updated = await this.templateModel.updateTitle(workflowId, record.version, next, {
      text,
      embedding,
      ...this.embeddingService.metadata(),
    });
    if (!updated) throw NotFoundError.of("Workflow", workflowId);

    logger.info("template renamed", { workflowId, version: record.version, title: next });
    return serializeTemplateSummary(updated);
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

  /**
   * Hard-deletes every version of a template, leaving a `template_deletions`
   * row behind in Postgres (D-2 - see Finding 0.1/0.2; task deletions stay in
   * the Mongo `audit_logs` collection).
   *
   * Refused while any task is still live on the workflow: `GET /tasks/:id/status`
   * resolves step names and the title out of the template, so removing it would
   * turn every in-flight request into a 404 the requester cannot act on.
   * Finished tasks are unaffected in practice - they are read from the audit
   * trail and their own document, not re-planned - so they do not block.
   *
   * The log is written BEFORE the Mongo delete, and confirmed after. There is
   * no cross-database transaction between Postgres and Mongo, so this
   * ordering is the only atomicity available: a row still reading
   * `versions_removed = 0` means the log landed but the delete did not - a
   * recoverable, visible failure rather than a silent gap. Do not reorder
   * this to delete-then-log.
   */
  async delete(workflowId: string, actor: AuthUser, requestId?: string | null): Promise<void> {
    const record = await this.getRecord(workflowId);

    const live: TaskStatus[] = [TASK_STATUS.COLLECTING, TASK_STATUS.READY, TASK_STATUS.IN_PROGRESS];
    const activeTasks = await this.taskModel.countByWorkflow(workflowId, live);
    if (activeTasks > 0) {
      throw new ConflictError(
        `Template '${workflowId}' has ${activeTasks} request${activeTasks === 1 ? "" : "s"} still in progress - ` +
          "wait for them to finish or cancel them before deleting it",
      );
    }

    const entry = await this.deletionLog.record({
      workflowId,
      templateTitle: record.title,
      latestVersion: record.version,
      institutionType: record.institution_type,
      reviewStatus: record.review_status,
      adminId: actor.id,
      adminUsername: actor.username,
      requestId,
      snapshot: {
        title: record.title,
        description: record.description,
        latest_version: record.version,
        institution_type: record.institution_type,
        review_status: record.review_status,
        created_at: record.created_at,
      },
    });

    const removed = await this.templateModel.deleteAllVersions(workflowId);
    if (removed === 0) throw NotFoundError.of("Workflow", workflowId);

    await this.deletionLog.markCompleted(entry.id, removed);

    logger.info("template deleted", { workflowId, title: record.title, versions: removed });
  }

  /** `GET /workflows/deletions` - the admin-facing deletion log, newest first. */
  listDeletions(limit: number, workflowId?: string): Promise<TemplateDeletionRecord[]> {
    return this.deletionLog.list(limit, workflowId);
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
