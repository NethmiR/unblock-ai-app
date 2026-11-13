import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/icons/Icon";
import {
  APPROVAL_DECISION_PRESENTATION,
  TASK_STATUS_PRESENTATION,
  TASK_STEP_STATUS_PRESENTATION,
} from "@/lib/task-request/task-status-presentation";
import type { ApprovalDecision, TaskStatus, TaskStepStatus } from "@/types/task";

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const presentation = TASK_STATUS_PRESENTATION[status];
  return <Badge tone={presentation.tone}>{presentation.label}</Badge>;
}

export function TaskStepStatusBadge({ status }: { status: TaskStepStatus }) {
  const presentation = TASK_STEP_STATUS_PRESENTATION[status];
  return (
    <Badge tone={presentation.tone} className="gap-1">
      <Icon name={presentation.icon} className="h-3.5 w-3.5" />
      {presentation.label}
    </Badge>
  );
}

export function ApprovalDecisionBadge({ decision }: { decision: ApprovalDecision }) {
  const presentation = APPROVAL_DECISION_PRESENTATION[decision];
  return (
    <Badge tone={presentation.tone} className="gap-1">
      <Icon name={presentation.icon} className="h-3.5 w-3.5" />
      {presentation.label}
    </Badge>
  );
}
