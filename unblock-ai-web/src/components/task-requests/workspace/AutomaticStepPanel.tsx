import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { TaskStepKind } from "@/types/task";

type AutomaticStepKind = TaskStepKind.NOTIFICATION | TaskStepKind.AUTOMATED_ACTION;

const MESSAGES: Record<AutomaticStepKind, string> = {
  [TaskStepKind.NOTIFICATION]: TASK_REQUEST_COPY.automatic.notification,
  [TaskStepKind.AUTOMATED_ACTION]: TASK_REQUEST_COPY.automatic.automatedAction,
};

export function AutomaticStepPanel({ kind }: { kind: AutomaticStepKind }) {
  return <p className="text-[13.5px] leading-relaxed text-muted">{MESSAGES[kind]}</p>;
}
