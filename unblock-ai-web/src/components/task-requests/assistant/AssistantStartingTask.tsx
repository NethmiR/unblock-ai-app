import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { IconName } from "@/types/icon";

const COPY = TASK_REQUEST_COPY.assistant.starting;

interface AssistantStartingTaskProps {
  title: string;
  isStarting: boolean;
  error: string | null;
  onStart: () => void;
}

export function AssistantStartingTask({ title, isStarting, error, onStart }: AssistantStartingTaskProps) {
  return (
    <div className="space-y-2 text-[14px] leading-relaxed text-ink">
      <p className="flex items-center gap-2">
        {isStarting && <Spinner size={14} />}
        <span>
          {COPY.lead} <strong className="font-semibold">{title}</strong> {COPY.forYou}
        </span>
      </p>
      {error && (
        <p role="alert" className="text-[12.5px] text-danger">
          {error}
        </p>
      )}
      {!isStarting && (
        <Button size="sm" leadingIcon={IconName.ARROW_UP_RIGHT} onClick={onStart}>
          {COPY.retry}
        </Button>
      )}
    </div>
  );
}
