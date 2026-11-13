"use client";
import { Icon } from "@/components/ui/icons/Icon";
import { AssistantMark } from "./AssistantMark";
import { useCurrentUser } from "@/components/providers/SessionProvider";
import { useSelectionCatalogue } from "@/lib/hooks/useSelectionCatalogue";
import { ASSISTANT_SUGGESTION_COUNT } from "@/lib/task-request/task-request-constant";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { IconName } from "@/types/icon";

const COPY = TASK_REQUEST_COPY.assistant;

interface AssistantWelcomeProps {
  onOpenCapabilities: () => void;
  onPickSuggestion: (text: string) => void;
}

export function AssistantWelcome({ onOpenCapabilities, onPickSuggestion }: AssistantWelcomeProps) {
  const user = useCurrentUser();
  const { data } = useSelectionCatalogue();
  const firstName = user.full_name.trim().split(/\s+/)[0] ?? "";
  const suggestions = (data?.workflow_templates ?? [])
    .map((template) => template.one_liner)
    .filter((text) => text.trim() !== "")
    .slice(0, ASSISTANT_SUGGESTION_COUNT);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-2 py-10 text-center">
      <AssistantMark size="lg" />
      <h2 className="mt-5 text-[26px] font-bold tracking-tight text-ink">{firstName ? COPY.greeting(firstName) : COPY.greetingFallback}</h2>
      <p className="mt-2 max-w-[52ch] text-[14px] leading-relaxed text-muted">{COPY.subline}</p>
      <button
        type="button"
        onClick={onOpenCapabilities}
        className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-pill border border-line-admin bg-surface px-4 py-2 text-[13px] font-semibold text-ink shadow-sm transition-colors hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <Icon name={IconName.SPARKLE} className="h-4 w-4 text-accent" />
        {COPY.seeCapabilities}
      </button>
      {suggestions.length > 0 && (
        <ul aria-label={COPY.suggestionsLabel} className="mt-6 flex max-w-[720px] flex-wrap justify-center gap-2">
          {suggestions.map((text) => (
            <li key={text}>
              <button
                type="button"
                onClick={() => onPickSuggestion(text)}
                className="cursor-pointer rounded-pill bg-bg px-3.5 py-1.5 text-[12.5px] text-muted transition-colors hover:bg-accent/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                {text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
