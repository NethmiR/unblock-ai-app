import { Button } from "@/components/ui/Button";
import { hasAudienceExclusion } from "@/lib/task-request/selection-trace-message";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { IconName } from "@/types/icon";
import type { SelectionTraceEntryDto } from "@/types/selection";

const COPY = TASK_REQUEST_COPY.assistant.noMatch;

interface AssistantNoMatchProps {
  trace: readonly SelectionTraceEntryDto[];
  showActions: boolean;
  onBrowse: () => void;
  onStartOver: () => void;
}

export function AssistantNoMatch({ trace, showActions, onBrowse, onStartOver }: AssistantNoMatchProps) {
  return (
    <div className="space-y-2 text-[14px] leading-relaxed text-ink">
      <p>{COPY.lead}</p>
      {hasAudienceExclusion(trace) && <p className="text-muted">{COPY.otherUnits}</p>}
      <p className="text-muted">{COPY.rephrase}</p>
      {showActions && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="secondary" leadingIcon={IconName.LIST} onClick={onBrowse}>
            {COPY.browse}
          </Button>
          <Button size="sm" variant="ghost" leadingIcon={IconName.REFRESH} onClick={onStartOver}>
            {TASK_REQUEST_COPY.assistant.startOver}
          </Button>
        </div>
      )}
    </div>
  );
}
