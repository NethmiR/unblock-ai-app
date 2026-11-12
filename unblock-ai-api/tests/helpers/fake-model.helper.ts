import { ObjectId } from "mongodb";
import { WorkflowTemplateStatus, WorkflowTemplateVisibility } from "../../src/data/constants/workflow-template.constant.js";
import type { WorkflowTemplateModel } from "../../src/models/workflow-template.model.js";
import type { WorkflowTemplateVersionModel } from "../../src/models/workflow-template-version.model.js";
import type {
  WorkflowTemplateDocument,
  WorkflowTemplateListOptions,
  WorkflowTemplateRetrieval,
  WorkflowTemplateRetrievalProjection,
  WorkflowTemplateVersionDocument,
  WorkflowTemplateVersionSummaryDocument,
} from "../../src/lib/types/workflow-template/workflow-template.type.js";
import type {
  SelectionSessionDocument,
  SessionOutcome,
  SessionRound,
} from "../../src/lib/types/selection/session.type.js";
import type {
  TaskAuditEntry,
  TaskDocument,
  TaskStatus,
  TaskStepState,
} from "../../src/lib/types/task/task.type.js";
import type { RequirementValue, TaskRequirement } from "../../src/lib/types/task/requirement.type.js";
import type { AuditLogDocument, AuditResource } from "../../src/lib/types/audit/audit.type.js";
import type { CompletionDocumentRecord } from "../../src/lib/types/document/document.type.js";

export class FakeWorkflowTemplateModel
  implements Pick<WorkflowTemplateModel, "insert" | "findById" | "findAll" | "update" | "listForRetrieval">
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
  implements Pick<WorkflowTemplateVersionModel, "insert" | "find" | "listSummaries">
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

  listSummaries(workflowTemplateId: string): Promise<WorkflowTemplateVersionSummaryDocument[]> {
    const matches = this.versions
      .filter((candidate) => candidate.workflow_template_id === workflowTemplateId)
      .sort((a, b) => b.version - a.version)
      .map(({ prompt: _prompt, definition: _definition, ...summary }) => summary);
    return Promise.resolve(matches);
  }
}

export class FakeSelectionSessionModel {
  readonly sessions = new Map<string, SelectionSessionDocument>();

  insert(doc: Omit<SelectionSessionDocument, "_id">): Promise<SelectionSessionDocument> {
    const _id = new ObjectId();
    const inserted: SelectionSessionDocument = { ...doc, _id };
    this.sessions.set(_id.toString(), inserted);
    return Promise.resolve(inserted);
  }

  findById(id: string | ObjectId): Promise<SelectionSessionDocument | null> {
    return Promise.resolve(this.sessions.get(String(id)) ?? null);
  }

  pushRound(id: string | ObjectId, round: SessionRound): Promise<SelectionSessionDocument | null> {
    const session = this.sessions.get(String(id));
    if (!session) return Promise.resolve(null);
    session.rounds.push(round);
    session.updated_at = new Date();
    return Promise.resolve(session);
  }

  setRoundAnswer(id: string | ObjectId, index: number, answer: string): Promise<SelectionSessionDocument | null> {
    const session = this.sessions.get(String(id));
    if (!session) return Promise.resolve(null);
    const round = session.rounds[index];
    if (!round) return Promise.resolve(session);
    round.answer = answer;
    round.answered_at = new Date();
    session.updated_at = new Date();
    return Promise.resolve(session);
  }

  finalize(
    id: string | ObjectId,
    outcome: SessionOutcome,
    selectedWorkflowTemplateId: string | null,
  ): Promise<SelectionSessionDocument | null> {
    const session = this.sessions.get(String(id));
    if (!session) return Promise.resolve(null);
    session.outcome = outcome;
    session.selected_workflow_template_id = selectedWorkflowTemplateId;
    session.updated_at = new Date();
    return Promise.resolve(session);
  }
}

export class FakeTaskModel {
  readonly tasks = new Map<string, TaskDocument>();
  private seq = 0;

  insert(doc: Omit<TaskDocument, "_id">): Promise<TaskDocument> {
    const _id = new ObjectId();
    const inserted: TaskDocument = { ...doc, _id };
    this.tasks.set(_id.toString(), inserted);
    return Promise.resolve(inserted);
  }

  findById(id: string | ObjectId): Promise<TaskDocument | null> {
    return Promise.resolve(this.tasks.get(String(id)) ?? null);
  }

  findCreatorById(id: string | ObjectId): Promise<string | null> {
    return Promise.resolve(this.tasks.get(String(id))?.created_by ?? null);
  }

  findAll(filters: {
    created_by?: string;
    session_id?: string;
    status?: TaskStatus;
  }): Promise<TaskDocument[]> {
    const matches = [...this.tasks.values()].filter((t) => {
      if (filters.created_by && t.created_by !== filters.created_by) return false;
      if (filters.session_id && t.session_id !== filters.session_id) return false;
      if (filters.status && t.status !== filters.status) return false;
      return true;
    });
    matches.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    return Promise.resolve(matches);
  }

  setValue(
    id: string | ObjectId,
    key: string,
    value: RequirementValue,
    requirementIndex: number,
  ): Promise<TaskDocument | null> {
    const task = this.tasks.get(String(id));
    if (!task) return Promise.resolve(null);
    task.values[key] = value;
    const requirement = task.requirements[requirementIndex];
    if (requirement) requirement.status = "filled";
    task.updated_at = new Date();
    return Promise.resolve(task);
  }

  replaceSteps(id: string | ObjectId, steps: TaskStepState[]): Promise<TaskDocument | null> {
    const task = this.tasks.get(String(id));
    if (!task) return Promise.resolve(null);
    task.steps = steps;
    task.updated_at = new Date();
    return Promise.resolve(task);
  }

  setStatus(id: string | ObjectId, status: TaskStatus): Promise<TaskDocument | null> {
    const task = this.tasks.get(String(id));
    if (!task) return Promise.resolve(null);
    task.status = status;
    task.updated_at = new Date();
    return Promise.resolve(task);
  }

  setCompletionDocument(id: string | ObjectId, record: CompletionDocumentRecord): Promise<TaskDocument | null> {
    const task = this.tasks.get(String(id));
    if (!task) return Promise.resolve(null);
    task.completion_document = record;
    task.updated_at = new Date();
    return Promise.resolve(task);
  }

  appendAudit(id: string | ObjectId, entry: TaskAuditEntry): Promise<TaskDocument | null> {
    const task = this.tasks.get(String(id));
    if (!task) return Promise.resolve(null);
    task.audit.push(entry);
    task.updated_at = new Date();
    return Promise.resolve(task);
  }

  findByStepToken(token: string): Promise<TaskDocument | null> {
    for (const task of this.tasks.values()) {
      if (task.steps.some((s) => s.approval_token === token)) return Promise.resolve(task);
    }
    return Promise.resolve(null);
  }

  updateStepAndStatus(id: string | ObjectId, steps: TaskStepState[], status: TaskStatus): Promise<TaskDocument | null> {
    const task = this.tasks.get(String(id));
    if (!task) return Promise.resolve(null);
    task.steps = steps;
    task.status = status;
    task.updated_at = new Date();
    return Promise.resolve(task);
  }

  updateStepAndStatusIfUnused(
    id: string | ObjectId,
    stepId: string,
    steps: TaskStepState[],
    status: TaskStatus,
  ): Promise<boolean> {
    const task = this.tasks.get(String(id));
    if (!task) return Promise.resolve(false);
    const current = task.steps.find((s) => s.step_id === stepId);
    if (!current || current.token_used_at !== null) return Promise.resolve(false);
    task.steps = steps;
    task.status = status;
    task.updated_at = new Date();
    return Promise.resolve(true);
  }

  appendRequirement(id: string | ObjectId, requirement: TaskRequirement): Promise<TaskDocument | null> {
    const task = this.tasks.get(String(id));
    if (!task) return Promise.resolve(null);
    task.requirements.push(requirement);
    task.updated_at = new Date();
    return Promise.resolve(task);
  }

  deleteById(id: string | ObjectId): Promise<boolean> {
    return Promise.resolve(this.tasks.delete(String(id)));
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
