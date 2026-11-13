import type { AssigneeResolution } from "../assignee/assignee-resolver.type.js";
import type { RequesterProfile } from "../requester/requester.type.js";
import type { WorkflowDefinition } from "../workflow/workflow.type.js";
import type { TaskStepRecord, UnsupportedTaskInput } from "./task-document.type.js";
import type { TaskFormRecord } from "./task-form.type.js";
import type { TaskFieldValue } from "./task-value.type.js";

export type { AssigneeResolution } from "../assignee/assignee-resolver.type.js";

export interface TaskPlanInput {
  definition: WorkflowDefinition;
  profile: RequesterProfile;
  resolutions: AssigneeResolution[];
}

export interface CompiledTaskPlan {
  steps: TaskStepRecord[];
  forms: TaskFormRecord[];
  values: Record<string, TaskFieldValue>;
  unsupported_inputs: UnsupportedTaskInput[];
}
