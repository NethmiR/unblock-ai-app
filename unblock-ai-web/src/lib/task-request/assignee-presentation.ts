import { TASK_REQUEST_COPY } from "./task-request-copy";
import { AssigneeSource, type TaskAssigneeDto } from "@/types/task";
import type { WorkflowOverviewAssigneeDto } from "@/types/selection";

const OVERVIEW = TASK_REQUEST_COPY.overview;

export const ASSIGNEE_SOURCE_LABELS: Record<AssigneeSource, string> = {
  [AssigneeSource.DIRECTORY]: TASK_REQUEST_COPY.status.assigneeSource.directory,
  [AssigneeSource.REQUESTER_CHOICE]: TASK_REQUEST_COPY.status.assigneeSource.requester_choice,
  [AssigneeSource.REQUESTER_SUPPLIED]: TASK_REQUEST_COPY.status.assigneeSource.requester_supplied,
  [AssigneeSource.REQUESTER]: TASK_REQUEST_COPY.status.assigneeSource.requester,
  [AssigneeSource.SYSTEM]: TASK_REQUEST_COPY.status.assigneeSource.system,
};

export function assigneeSourceLabel(source: AssigneeSource): string {
  return ASSIGNEE_SOURCE_LABELS[source];
}

export function assigneeDisplayName(assignee: TaskAssigneeDto): string {
  switch (assignee.source) {
    case AssigneeSource.REQUESTER:
      return OVERVIEW.you;
    case AssigneeSource.SYSTEM:
      return OVERVIEW.automatic;
    case AssigneeSource.DIRECTORY:
    case AssigneeSource.REQUESTER_CHOICE:
    case AssigneeSource.REQUESTER_SUPPLIED:
      return assignee.full_name ?? assignee.designation_title ?? TASK_REQUEST_COPY.approval.unknownApprover;
    default: {
      const unreachable: never = assignee.source;
      return unreachable;
    }
  }
}

export function overviewAssigneeLabel(assignee: WorkflowOverviewAssigneeDto): string {
  switch (assignee.source) {
    case AssigneeSource.REQUESTER:
      return OVERVIEW.you;
    case AssigneeSource.SYSTEM:
      return OVERVIEW.automatic;
    case AssigneeSource.DIRECTORY:
      return assignee.label ?? ASSIGNEE_SOURCE_LABELS[AssigneeSource.DIRECTORY];
    case AssigneeSource.REQUESTER_CHOICE:
      return OVERVIEW.youChooseThisPerson;
    case AssigneeSource.REQUESTER_SUPPLIED:
      return assignee.label ? `${assignee.label} · ${OVERVIEW.youNameThisPerson}` : OVERVIEW.youNameThisPerson;
    default: {
      const unreachable: never = assignee.source;
      return unreachable;
    }
  }
}
