"use client";
import { useId, useState } from "react";
import { Icon } from "@/components/ui/icons/Icon";
import { ASSISTANT_TRACE_STAGGER_MS } from "@/lib/task-request/task-request-constant";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { SELECTION_TRACE_ICONS, selectionTraceMessage } from "@/lib/task-request/selection-trace-message";
import { cn } from "@/lib/utils/cn";
import { IconName } from "@/types/icon";
import type { SelectionTraceEntryDto } from "@/types/selection";

const COPY = TASK_REQUEST_COPY.assistant;

export function AssistantThinkingTrace({ trace, defaultExpanded }: { trace: readonly SelectionTraceEntryDto[]; defaultExpanded: boolean }) {
  const listId = useId();
  const [toggled, setToggled] = useState<boolean | null>(null);
  const expanded = toggled ?? defaultExpanded;
  if (trace.length === 0) return null;

  return (
    <div className="mb-2">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setToggled(!expanded)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-control text-[12.5px] font-semibold text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        {expanded ? COPY.hideThinking : COPY.showThinking}
        <Icon name={IconName.CHEVRON_DOWN} className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded && (
        <ol id={listId} className="mt-2 space-y-1.5 border-l-2 border-line pl-3">
          {trace.map((entry, index) => (
            <li
              key={`${entry.step}-${index}`}
              className="animate-ub-fade-in flex items-start gap-2 text-[12.5px] leading-relaxed text-muted"
              style={{ animationDelay: `${index * ASSISTANT_TRACE_STAGGER_MS}ms` }}
            >
              <Icon name={SELECTION_TRACE_ICONS[entry.step]} className="mt-0.5 h-3.5 w-3.5" />
              <span>{selectionTraceMessage(entry)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
