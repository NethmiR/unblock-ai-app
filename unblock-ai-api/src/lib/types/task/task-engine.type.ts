import type { TaskEffectKind } from "../../../data/constants/task.constant.js";
import type { WorkflowDefinition } from "../workflow/workflow.type.js";
import type { TaskDocument } from "./task-document.type.js";

export type TaskEffect =
  | { kind: TaskEffectKind.DISPATCH_APPROVAL; step_id: string }
  | { kind: TaskEffectKind.NOTIFY_REQUESTER_ACTION_REQUIRED; step_id: string }
  | { kind: TaskEffectKind.NOTIFY_INFORMATION_REQUESTED; step_id: string }
  | { kind: TaskEffectKind.SEND_STEP_NOTIFICATION; step_id: string }
  | { kind: TaskEffectKind.NOTIFY_TASK_REJECTED; step_id: string }
  | { kind: TaskEffectKind.NOTIFY_TASK_COMPLETED }
  | { kind: TaskEffectKind.REVOKE_APPROVAL_LINKS };

export interface TaskEngineContext {
  definition: WorkflowDefinition;
  now: Date;
  maxInformationRequestsPerStep: number;
}

export interface TaskEngineResult {
  task: TaskDocument;
  effects: TaskEffect[];
}
