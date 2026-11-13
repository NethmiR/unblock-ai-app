import type { AssigneeSource } from "../../../data/constants/assignee.constant.js";
import type { TaskStepKind } from "../../../data/constants/task.constant.js";

export interface WorkflowOverviewAssignee {
  source: AssigneeSource;
  label: string | null;
}

export interface WorkflowOverviewStep {
  id: string;
  name: string;
  kind: TaskStepKind;
  assignee: WorkflowOverviewAssignee | null;
  is_conditional: boolean;
}

export interface WorkflowOverview {
  workflow_template_id: string;
  title: string;
  one_liner: string;
  description: string;
  steps: WorkflowOverviewStep[];
  information_needed: string[];
  requires_approver_details: boolean;
}
