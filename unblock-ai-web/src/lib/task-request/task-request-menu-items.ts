import { TaskRequestAction, type TaskRequestActions } from "@/lib/hooks/useTaskRequestActions";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { IconName } from "@/types/icon";
import { MenuItemTone, type MenuItem } from "@/types/menu";
import { TaskStatus, TaskStepStatus, type TaskAvailableActionsDto, type TaskSummaryDto } from "@/types/task";

const COPY = TASK_REQUEST_COPY.actions;

export function lifecycleMenuItems(
  target: Pick<TaskSummaryDto, "id" | "title">,
  available: Pick<TaskAvailableActionsDto, "can_cancel" | "can_delete">,
  actions: TaskRequestActions,
): MenuItem[] {
  return [
    {
      label: COPY.cancel,
      icon: IconName.CROSS_CIRCLE,
      onSelect: () => actions.request(TaskRequestAction.CANCEL, target),
      disabledReason: available.can_cancel ? undefined : COPY.cannotCancel,
    },
    {
      label: COPY.delete,
      icon: IconName.TRASH,
      tone: MenuItemTone.DANGER,
      onSelect: () => actions.request(TaskRequestAction.DELETE, target),
      disabledReason: available.can_delete ? undefined : COPY.cannotDelete,
    },
  ];
}

export function summaryAvailableActions(
  task: Pick<TaskSummaryDto, "status" | "current_steps" | "progress">,
): Pick<TaskAvailableActionsDto, "can_cancel" | "can_delete"> {
  const isActive = task.status === TaskStatus.IN_PROGRESS;
  const mayHaveDispatchedApproval =
    task.progress.completed > 0 || task.current_steps.some((step) => step.status === TaskStepStatus.AWAITING_APPROVER);
  return { can_cancel: isActive, can_delete: !isActive || !mayHaveDispatchedApproval };
}
