import { assigneeDisplayName } from "./assignee-presentation";
import { TASK_REQUEST_COPY } from "./task-request-copy";
import { TaskStepKind, TaskStepOrigin, TaskStepOutcome, TaskStepStatus, type TaskDto, type TaskStepDto } from "@/types/task";

const PANEL = TASK_REQUEST_COPY.stepPanel;

export interface StepPanelHeading {
  heading: string;
  subline: string;
}

function findStep(task: Pick<TaskDto, "steps">, stepId: string): TaskStepDto | null {
  return task.steps.find((step) => step.id === stepId) ?? null;
}

export function informationRequester(step: TaskStepDto, task: Pick<TaskDto, "steps">): TaskStepDto | null {
  return step.information_request ? findStep(task, step.information_request.requested_by_step_id) : null;
}

export function requestedByName(step: TaskStepDto, task: Pick<TaskDto, "steps">): string | null {
  switch (step.origin) {
    case TaskStepOrigin.INFORMATION_REQUEST: {
      const requester = informationRequester(step, task);
      return requester?.assignee ? assigneeDisplayName(requester.assignee) : null;
    }
    case TaskStepOrigin.APPROVAL_REPEAT:
      return step.assignee ? assigneeDisplayName(step.assignee) : null;
    case TaskStepOrigin.WORKFLOW:
    case TaskStepOrigin.ENTRY_FORM:
      return null;
    default: {
      const unreachable: never = step.origin;
      return unreachable;
    }
  }
}

export function rejectingStep(task: Pick<TaskDto, "steps">): TaskStepDto | null {
  const rejected = task.steps.filter((step) => step.outcome === TaskStepOutcome.REJECTED);
  return rejected[rejected.length - 1] ?? null;
}

export function stepPanelHeading(step: TaskStepDto): StepPanelHeading {
  switch (step.status) {
    case TaskStepStatus.SKIPPED:
      return { heading: PANEL.notRequired, subline: PANEL.skippedSubline };
    case TaskStepStatus.CANCELLED:
      return { heading: PANEL.cancelled, subline: PANEL.cancelledSubline };
    case TaskStepStatus.COMPLETED:
      return { heading: PANEL.completed, subline: PANEL.doneSubline };
    case TaskStepStatus.AWAITING_APPROVER:
      return { heading: PANEL.waitingForApproval, subline: PANEL.approvalSubline };
    case TaskStepStatus.AWAITING_REQUESTER:
      return step.kind === TaskStepKind.INFORMATION_REQUEST
        ? { heading: PANEL.moreInformationRequested, subline: PANEL.informationSubline }
        : { heading: PANEL.waitingForYou, subline: PANEL.formSubline };
    case TaskStepStatus.UPCOMING:
      return { heading: PANEL.upcoming, subline: PANEL.formUpcomingSubline };
    default: {
      const unreachable: never = step.status;
      return unreachable;
    }
  }
}
