import { ObjectId } from "mongodb";
import { WorkflowTemplateStatus, WorkflowTemplateVisibility } from "../../src/data/constants/workflow-template.constant.js";
import type { WorkflowTemplateModel } from "../../src/models/workflow-template.model.js";
import type { WorkflowTemplateVersionModel } from "../../src/models/workflow-template-version.model.js";
import type {
  WorkflowTemplateCatalogueProjection,
  WorkflowTemplateDocument,
  WorkflowTemplateListOptions,
  WorkflowTemplateVersionKey,
  WorkflowTemplateRetrieval,
  WorkflowTemplateRetrievalProjection,
  WorkflowTemplateVersionDocument,
  WorkflowTemplateVersionSummaryDocument,
} from "../../src/lib/types/workflow-template/workflow-template.type.js";
import type { SelectionSessionDocument } from "../../src/lib/types/selection/session.type.js";
import type { ISelectionSessionModel } from "../../src/models/selection-session.model.js";
import type { WorkflowTemplateAudience } from "../../src/lib/types/selection/eligibility.type.js";
import { taskRevisionConflict } from "../../src/errors/task.error.js";
import type { ITaskModel } from "../../src/models/task.model.js";
import type { TaskDocument } from "../../src/lib/types/task/task-document.type.js";
import type { TaskListFilter, TaskListPage } from "../../src/lib/types/task/task-dto.type.js";
import type { AuditLogDocument, AuditResource } from "../../src/lib/types/audit/audit.type.js";

function cloneDocument<T extends { _id: ObjectId }>(document: T): T {
  const { _id, ...rest } = document;
  return { ...structuredClone(rest), _id } as T;
}

export class FakeWorkflowTemplateModel
  implements Pick<WorkflowTemplateModel, "insert" | "findById" | "findAll" | "update" | "listForRetrieval" | "listPublishedForCatalogue">
{
  readonly templates = new Map<string, WorkflowTemplateDocument>();

  insert(doc: WorkflowTemplateDocument): Promise<WorkflowTemplateDocument> {
    this.templates.set(doc._id, { ...doc });
    return Promise.resolve({ ...doc });
  }

  findById(id: string): Promise<WorkflowTemplateDocument | null> {
    const found = this.templates.get(id);
    return Promise.resolve(found ? { ...found } : null);
  }

  findAll(options: WorkflowTemplateListOptions): Promise<WorkflowTemplateDocument[]> {
    const matches = [...this.templates.values()]
      .filter((template) => options.includeArchived || template.archived_at === null)
      .filter((template) => options.visibility === WorkflowTemplateVisibility.ALL || template.status === WorkflowTemplateStatus.PUBLISHED)
      .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime())
      .map(({ retrieval: _retrieval, ...rest }) => rest as WorkflowTemplateDocument);
    return Promise.resolve(matches);
  }

  update(id: string, fields: Partial<Omit<WorkflowTemplateDocument, "_id">>): Promise<WorkflowTemplateDocument | null> {
    const existing = this.templates.get(id);
    if (!existing) return Promise.resolve(null);
    const updated = { ...existing, ...fields };
    this.templates.set(id, updated);
    return Promise.resolve({ ...updated });
  }

  listPublishedForCatalogue(): Promise<WorkflowTemplateCatalogueProjection[]> {
    return Promise.resolve(
      [...this.templates.values()]
        .filter((template) => template.status === WorkflowTemplateStatus.PUBLISHED && template.archived_at === null)
        .flatMap((template) =>
          template.current_version === null ? [] : [{ _id: template._id, title: template.title, current_version: template.current_version }],
        ),
    );
  }

  listForRetrieval(options: { institutionType?: string | null }): Promise<WorkflowTemplateRetrievalProjection[]> {
    const matches = [...this.templates.values()].filter(
      (template) =>
        template.status === WorkflowTemplateStatus.PUBLISHED &&
        template.archived_at === null &&
        template.retrieval !== null &&
        template.current_version !== null &&
        (!options.institutionType || template.retrieval.institution_type === options.institutionType),
    );
    return Promise.resolve(
      matches.map((template) => ({
        _id: template._id,
        title: template.title,
        description: template.description,
        current_version: template.current_version as number,
        retrieval: template.retrieval as WorkflowTemplateRetrieval,
      })),
    );
  }
}

export class FakeWorkflowTemplateVersionModel
  implements Pick<WorkflowTemplateVersionModel, "insert" | "find" | "listSummaries" | "findAudiences">
{
  readonly versions: WorkflowTemplateVersionDocument[] = [];

  insert(doc: Omit<WorkflowTemplateVersionDocument, "_id">): Promise<WorkflowTemplateVersionDocument> {
    const inserted: WorkflowTemplateVersionDocument = { ...doc, _id: new ObjectId() };
    this.versions.push(inserted);
    return Promise.resolve({ ...inserted });
  }

  find(workflowTemplateId: string, version: number): Promise<WorkflowTemplateVersionDocument | null> {
    const found = this.versions.find(
      (candidate) => candidate.workflow_template_id === workflowTemplateId && candidate.version === version,
    );
    return Promise.resolve(found ? { ...found } : null);
  }

  findAudiences(keys: readonly WorkflowTemplateVersionKey[]): Promise<Map<string, WorkflowTemplateAudience>> {
    const audiences = new Map<string, WorkflowTemplateAudience>();
    for (const key of keys) {
      const found = this.versions.find((candidate) => candidate.workflow_template_id === key.workflow_template_id && candidate.version === key.version);
      if (!found) continue;
      const appliesTo = found.definition.scope.applies_to;
      audiences.set(key.workflow_template_id, { actorType: appliesTo.actor_type, organisationalUnitCodes: [...appliesTo.organisational_unit_codes] });
    }
    return Promise.resolve(audiences);
  }

  listSummaries(workflowTemplateId: string): Promise<WorkflowTemplateVersionSummaryDocument[]> {
    const matches = this.versions
      .filter((candidate) => candidate.workflow_template_id === workflowTemplateId)
      .sort((a, b) => b.version - a.version)
      .map(({ prompt: _prompt, definition: _definition, ...summary }) => summary);
    return Promise.resolve(matches);
  }
}

export class FakeSelectionSessionModel implements ISelectionSessionModel {
  readonly sessions = new Map<string, SelectionSessionDocument>();
  now: () => Date = () => new Date();

  insert(doc: Omit<SelectionSessionDocument, "_id">): Promise<SelectionSessionDocument> {
    const inserted: SelectionSessionDocument = cloneDocument({ ...doc, _id: new ObjectId() });
    this.sessions.set(inserted._id.toString(), inserted);
    return Promise.resolve(cloneDocument(inserted));
  }

  findOwned(id: string, userId: string): Promise<SelectionSessionDocument | null> {
    const found = this.sessions.get(id);
    const live = found && found.created_by === userId && found.expires_at.getTime() > this.now().getTime();
    return Promise.resolve(live ? cloneDocument(found) : null);
  }

  replace(session: SelectionSessionDocument): Promise<void> {
    this.sessions.set(session._id.toString(), cloneDocument(session));
    return Promise.resolve();
  }

  async deleteOwned(id: string, userId: string): Promise<boolean> {
    if (!(await this.findOwned(id, userId))) return false;
    this.sessions.delete(id);
    return true;
  }

  deleteById(id: string): Promise<void> {
    this.sessions.delete(id);
    return Promise.resolve();
  }
}

export class FakeTaskModel implements ITaskModel {
  readonly tasks = new Map<string, TaskDocument>();
  private seq = 0;

  insert(task: TaskDocument): Promise<TaskDocument> {
    this.tasks.set(task._id.toString(), cloneDocument(task));
    return Promise.resolve(cloneDocument(task));
  }

  findById(id: string): Promise<TaskDocument | null> {
    const found = this.tasks.get(id);
    return Promise.resolve(found ? cloneDocument(found) : null);
  }

  findOwnedSummaryPage(userId: string, filter: TaskListFilter): Promise<TaskListPage<TaskDocument>> {
    const search = filter.search?.toLowerCase() ?? null;
    const matches = [...this.tasks.values()]
      .filter((task) => task.created_by === userId)
      .filter((task) => filter.status === null || task.status === filter.status)
      .filter((task) => search === null || task.reference.toLowerCase().includes(search) || task.title.toLowerCase().includes(search))
      .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());
    return Promise.resolve({
      tasks: matches.slice(filter.offset, filter.offset + filter.limit).map((task) => cloneDocument(task)),
      total: matches.length,
    });
  }

  findCreatorById(id: string): Promise<string | null> {
    return Promise.resolve(this.tasks.get(id)?.created_by ?? null);
  }

  replaceWithRevision(task: TaskDocument, expectedRevision: number): Promise<TaskDocument> {
    const existing = this.tasks.get(task._id.toString());
    if (!existing || existing.revision !== expectedRevision) return Promise.reject(taskRevisionConflict());
    const next = cloneDocument({ ...task, revision: expectedRevision + 1 });
    this.tasks.set(task._id.toString(), next);
    return Promise.resolve(cloneDocument(next));
  }

  findByApprovalTokenHash(tokenHash: string): Promise<TaskDocument | null> {
    const found = [...this.tasks.values()].find((task) => task.steps.some((step) => step.approval?.token_hash === tokenHash));
    return Promise.resolve(found ? cloneDocument(found) : null);
  }

  deleteById(id: string): Promise<boolean> {
    return Promise.resolve(this.tasks.delete(id));
  }

  nextSequence(): Promise<number> {
    this.seq += 1;
    return Promise.resolve(this.seq);
  }
}

export class FakeAuditLogModel {
  readonly entries: AuditLogDocument[] = [];

  insert(doc: Omit<AuditLogDocument, "_id">): Promise<AuditLogDocument> {
    const inserted: AuditLogDocument = { ...doc, _id: new ObjectId() };
    this.entries.push(inserted);
    return Promise.resolve(inserted);
  }

  findByResource(resource: AuditResource, resourceId?: string): Promise<AuditLogDocument[]> {
    const matches = this.entries.filter(
      (e) => e.resource === resource && (!resourceId || e.resource_id === resourceId),
    );
    return Promise.resolve([...matches].reverse());
  }
}
