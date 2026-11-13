import { Icon } from "@/components/ui/icons/Icon";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { IconName } from "@/types/icon";
import type { SelectionOptionDto } from "@/types/selection";

const COPY = TASK_REQUEST_COPY.assistant.manualChoice;

interface AssistantManualChoiceProps {
  options: readonly SelectionOptionDto[];
  disabled: boolean;
  onChoose: (workflowTemplateId: string) => void;
}

export function AssistantManualChoice({ options, disabled, onChoose }: AssistantManualChoiceProps) {
  return (
    <div>
      <p className="text-[14px] leading-relaxed text-ink">{COPY.lead}</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const workflowTemplateId = option.workflow_template_id;
          if (workflowTemplateId === null) return null;
          return (
            <li key={option.id}>
              <button
                type="button"
                disabled={disabled}
                aria-label={COPY.choose(option.label)}
                onClick={() => onChoose(workflowTemplateId)}
                className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-card border border-line-admin bg-surface px-4 py-3 text-left text-[13.5px] font-semibold text-ink transition-colors hover:border-accent/40 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {option.label}
                <Icon name={IconName.CHEVRON_RIGHT} className="h-4 w-4 text-muted" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
