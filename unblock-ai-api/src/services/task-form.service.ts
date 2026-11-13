import { TaskAuditEvent, TaskStepStatus, TERMINAL_TASK_STATUSES } from "../data/constants/task.constant.js";
import { FormValidationMode, TaskFormStatus } from "../data/constants/task-form.constant.js";
import {
  taskFormAlreadySubmitted,
  taskFormInvalid,
  taskFormNotAwaitingInput,
  taskFormNotFound,
  taskNotActive,
  taskNotFound,
} from "../errors/task.error.js";
import { validateFormValues } from "../utils/task/task-field-validator.util.js";
import type { ITaskModel } from "../models/task.model.js";
import type { TaskEngineService } from "./task-engine.service.js";
import type { TaskTransitionService } from "./task-transition.service.js";
import type { TaskDocument } from "../lib/types/task/task-document.type.js";
import type { FormValuesInput, TaskFormRecord } from "../lib/types/task/task-form.type.js";

export interface TaskFormServiceOptions {
  taskModel: Pick<ITaskModel, "findById">;
  taskEngine: Pick<TaskEngineService, "submitForm">;
  transitions: Pick<TaskTransitionService, "context" | "save" | "commit" | "now">;
}

interface PreparedForm {
  task: TaskDocument;
  form: TaskFormRecord;
}

export class TaskFormService {
  private readonly taskModel: Pick<ITaskModel, "findById">;
  private readonly taskEngine: Pick<TaskEngineService, "submitForm">;
  private readonly transitions: Pick<TaskTransitionService, "context" | "save" | "commit" | "now">;

  constructor({ taskModel, taskEngine, transitions }: TaskFormServiceOptions) {
    this.taskModel = taskModel;
    this.taskEngine = taskEngine;
    this.transitions = transitions;
  }

  async saveDraft(taskId: string, formId: string, values: FormValuesInput): Promise<TaskDocument> {
    const { task, form } = await this.prepare(taskId, formId);
    const merged = this.merge(task, form, values, FormValidationMode.DRAFT);
    const now = this.transitions.now();
    const drafted: TaskDocument = {
      ...merged,
      forms: merged.forms.map((candidate) => (candidate.id === formId ? { ...candidate, saved_at: now } : candidate)),
      audit: [...merged.audit, { event: TaskAuditEvent.FORM_DRAFT_SAVED, step_id: form.step_id, detail: null, created_at: now }],
    };
    return this.transitions.save(drafted, task.revision);
  }

  async submit(taskId: string, formId: string, values: FormValuesInput): Promise<TaskDocument> {
    const { task, form } = await this.prepare(taskId, formId);
    const step = task.steps.find((candidate) => candidate.id === form.step_id);
    if (!step || step.status !== TaskStepStatus.AWAITING_REQUESTER) throw taskFormNotAwaitingInput();
    const merged = this.merge(task, form, values, FormValidationMode.SUBMIT);
    const result = this.taskEngine.submitForm(merged, formId, await this.transitions.context(task));
    return this.transitions.commit(result, task.revision);
  }

  private async prepare(taskId: string, formId: string): Promise<PreparedForm> {
    const task = await this.taskModel.findById(taskId);
    if (!task) throw taskNotFound(taskId);
    if (TERMINAL_TASK_STATUSES.includes(task.status)) throw taskNotActive();
    const form = task.forms.find((candidate) => candidate.id === formId);
    if (!form) throw taskFormNotFound(formId);
    if (form.status === TaskFormStatus.SUBMITTED) throw taskFormAlreadySubmitted();
    return { task, form };
  }

  private merge(task: TaskDocument, form: TaskFormRecord, values: FormValuesInput, mode: FormValidationMode): TaskDocument {
    const fields = form.sections.flatMap((section) => section.fields);
    const result = validateFormValues({ fields, values, allValues: task.values, mode });
    if (result.issues.length > 0) throw taskFormInvalid(result.issues);
    return { ...task, values: { ...task.values, ...result.values } };
  }
}
