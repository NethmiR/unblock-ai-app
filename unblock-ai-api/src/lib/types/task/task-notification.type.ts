import type { RenderedDocument } from "../document/document.type.js";
import type { TaskDocument, TaskStepRecord } from "./task-document.type.js";

export interface ITaskNotifier {
  sendApprovalRequest(task: TaskDocument, step: TaskStepRecord, token: string): Promise<boolean>;
  sendRequesterActionRequired(task: TaskDocument, step: TaskStepRecord): Promise<boolean>;
  sendInformationRequested(task: TaskDocument, step: TaskStepRecord): Promise<boolean>;
  sendTaskRejected(task: TaskDocument, step: TaskStepRecord): Promise<boolean>;
  sendTaskCompleted(task: TaskDocument, transcript: RenderedDocument | null): Promise<boolean>;
  sendStepNotification(task: TaskDocument, step: TaskStepRecord): Promise<boolean>;
}

export interface ITaskTranscriptRenderer {
  renderForTask(task: TaskDocument): Promise<RenderedDocument | null>;
}
