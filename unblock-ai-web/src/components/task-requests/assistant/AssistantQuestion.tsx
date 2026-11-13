import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import type { SelectionOptionDto } from "@/types/selection";

interface AssistantQuestionProps {
  question: string | null;
  options: readonly SelectionOptionDto[];
  disabled: boolean;
  onPick: (label: string) => void;
}

export function AssistantQuestion({ question, options, disabled, onPick }: AssistantQuestionProps) {
  return (
    <div>
      {question && <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{question}</p>}
      {options.length > 0 && (
        <div role="group" aria-label={TASK_REQUEST_COPY.assistant.question.optionsLabel} className="mt-3 flex flex-wrap gap-2">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              onClick={() => onPick(option.label)}
              className="cursor-pointer rounded-pill border border-accent/30 bg-surface px-3.5 py-1.5 text-[13px] font-medium text-accent transition-colors hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
