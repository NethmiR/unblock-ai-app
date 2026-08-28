import { ObjectId } from "mongodb";
import type { DraftDocument } from "../../src/lib/types/draft/draft.type.js";
import type { TemplateDocument, RetrievalProjection } from "../../src/lib/types/template/template.type.js";
import type {
  SelectionSessionDocument,
  SessionOutcome,
  SessionRound,
} from "../../src/lib/types/selection/session.type.js";
import type { ReviewStatus } from "../../src/lib/types/workflow/workflow.type.js";
import type {
  TaskAuditEntry,
  TaskDocument,
  TaskStatus,
  TaskStepState,
} from "../../src/lib/types/task/task.type.js";
import type { RequirementValue, TaskRequirement } from "../../src/lib/types/task/requirement.type.js";
import type { AuditLogDocument, AuditResource } from "../../src/lib/types/audit/audit.type.js";

export class FakeDraftModel {
  readonly drafts = new Map<string, DraftDocument>();

  findByTextHash(hash: string): Promise<DraftDocument | null> {
    for (const draft of this.drafts.values()) {
      if (draft.text_sha256 === hash) return Promise.resolve(draft);
    }
    return Promise.resolve(null);
  }

  insert(doc: Omit<DraftDocument, "_id">): Promise<DraftDocument> {
    const _id = new ObjectId();
    const inserted: DraftDocument = { ...doc, _id };
    this.drafts.set(_id.toString(), inserted);
    return Promise.resolve(inserted);
  }

  findById(id: string | ObjectId): Promise<DraftDocument | null> {
    return Promise.resolve(this.drafts.get(String(id)) ?? null);
  }

  findAll(options: { limit: number }): Promise<DraftDocument[]> {
    const all = [...this.drafts.values()].sort(
      (a, b) => b.created_at.getTime() - a.created_at.getTime(),
    );
    return Promise.resolve(all.slice(0, options.limit));
  }

  patch(id: string | ObjectId, fields: Partial<DraftDocument>): Promise<DraftDocument | null> {
    const existing = this.drafts.get(String(id));
    if (!existing) return Promise.resolve(null);
    const updated = { ...existing, ...fields, updated_at: new Date() };
    this.drafts.set(String(id), updated);
    return Promise.resolve(updated);
  }
}

export class FakeTemplateModel {
  readonly templates: TemplateDocument[] = [];

  findLatestVersionNumber(workflowId: string): Promise<number> {
    const versions = this.templates.filter((t) => t.workflow_id === workflowId).map((t) => t.version);
    return Promise.resolve(versions.length === 0 ? 0 : Math.max(...versions));
  }

  demoteLatest(workflowId: string, now: Date): Promise<void> {
    for (const template of this.templates) {
      if (template.workflow_id === workflowId && template.is_latest) {
        template.is_latest = false;
        template.updated_at = now;
      }
    }
    return Promise.resolve();
  }

  insert(doc: Omit<TemplateDocument, "_id">): Promise<void> {
    this.templates.push({ ...doc, _id: new ObjectId() } as TemplateDocument);
    return Promise.resolve();
  }

  findOneByIdAndVersion(workflowId: string, version?: number): Promise<TemplateDocument | null> {
    const match = version
      ? this.templates.find((t) => t.workflow_id === workflowId && t.version === Number(version))
      : this.templates.find((t) => t.workflow_id === workflowId && t.is_latest);
    return Promise.resolve(match ?? null);
  }

  findAll(filters: { institution_type?: string; review_status?: string }): Promise<TemplateDocument[]> {
    const matches = this.templates.filter((t) => {
      if (!t.is_latest) return false;
      if (filters.institution_type && t.institution_type !== filters.institution_type) return false;
      if (filters.review_status && t.review_status !== filters.review_status) return false;
      return true;
    });
    return Promise.resolve(matches);
  }

  searchByText(needle: string): Promise<TemplateDocument[]> {
    const rx = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const matches = this.templates.filter((t) => t.is_latest && (rx.test(t.title) || rx.test(t.description)));
    return Promise.resolve(matches);
  }

  updateReviewStatus(
    workflowId: string,
    version: number,
    reviewStatus: ReviewStatus,
  ): Promise<TemplateDocument | null> {
    const match = this.templates.find((t) => t.workflow_id === workflowId && t.version === Number(version));
    if (!match) return Promise.resolve(null);
    match.review_status = reviewStatus;
    match.document = { ...match.document, metadata: { ...match.document.metadata, review_status: reviewStatus } };
    match.updated_at = new Date();
    return Promise.resolve(match);
  }

  updateTitle(
    workflowId: string,
    version: number,
    title: string,
    retrieval: { text: string; embedding: number[]; model: string; dim: number; embedded_at: string },
  ): Promise<TemplateDocument | null> {
    const match = this.templates.find((t) => t.workflow_id === workflowId && t.version === Number(version));
    if (!match) return Promise.resolve(null);
    match.title = title;
    match.document = { ...match.document, title };
    match.retrieval = { ...match.retrieval, ...retrieval };
    match.updated_at = new Date();
    return Promise.resolve(match);
  }

  deleteAllVersions(workflowId: string): Promise<number> {
    let removed = 0;
    for (let i = this.templates.length - 1; i >= 0; i -= 1) {
      if (this.templates[i]!.workflow_id === workflowId) {
        this.templates.splice(i, 1);
        removed += 1;
      }
    }
    return Promise.resolve(removed);
  }

  listForRetrieval(options: { institutionType?: string | null }): Promise<RetrievalProjection[]> {
    const matches = this.templates.filter((t) => {
      if (!t.is_latest || t.review_status !== "confirmed") return false;
      if (options.institutionType && t.institution_type !== options.institutionType) return false;
      return true;
    });
    return Promise.resolve(
      matches.map((t) => ({
        workflow_id: t.workflow_id,
        version: t.version,
        title: t.title,
        description: t.description,
        retrieval: {
          embedding: t.retrieval.embedding,
          aliases_lower: t.retrieval.aliases_lower,
          text: t.retrieval.text,
        },
        document: { retrieval_summary: t.document.retrieval_summary },
      })),
    );
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
    selectedWorkflowId: string | null,
  ): Promise<SelectionSessionDocument | null> {
    const session = this.sessions.get(String(id));
    if (!session) return Promise.resolve(null);
    session.outcome = outcome;
    session.selected_workflow_id = selectedWorkflowId;
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

  findAll(filters: { session_id?: string; status?: TaskStatus }): Promise<TaskDocument[]> {
    const matches = [...this.tasks.values()].filter((t) => {
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

  countByWorkflow(workflowId: string, statuses?: TaskStatus[]): Promise<number> {
    const matches = [...this.tasks.values()].filter(
      (t) => t.workflow_id === workflowId && (!statuses || statuses.includes(t.status)),
    );
    return Promise.resolve(matches.length);
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
