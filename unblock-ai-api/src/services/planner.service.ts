import { buildRequirements } from "../utils/task/requirement-builder.util.js";
import { STEP_STATE } from "../data/constants/status.constant.js";
import type { WorkflowDefinition } from "../lib/types/workflow/workflow.type.js";
import type { TaskRequirement } from "../lib/types/task/requirement.type.js";
import type { TaskStepState } from "../lib/types/task/task.type.js";

export interface PlannerCompileResult {
  requirements: TaskRequirement[];
  steps: TaskStepState[];
}

export class PlannerService {
  compile(workflow: WorkflowDefinition): PlannerCompileResult {
    return {
      requirements: buildRequirements(workflow),
      steps: workflow.steps.map((step) => ({
        step_id: step.id,
        name: step.name,
        type: step.type,
        depends_on: step.depends_on,
        state: STEP_STATE.BLOCKED,
        assignee: null,
        outcome: null,
        reason: null,
        responded_at: null,
        approval_token: null,
        token_expires_at: null,
        token_used_at: null,
        notified_at: null,
        reopen_count: 0,
      })),
    };
  }
}
