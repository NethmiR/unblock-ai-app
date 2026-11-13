"use client";
import { useId, useState, type KeyboardEvent, type RefObject } from "react";
import { Icon } from "@/components/ui/icons/Icon";
import { ASSISTANT_COMPOSER_MAX_ROWS, SELECTION_FIELD_LIMIT } from "@/lib/task-request/task-request-constant";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { cn } from "@/lib/utils/cn";
import { IconName } from "@/types/icon";

const COPY = TASK_REQUEST_COPY.assistant;
const MAX_LENGTH = SELECTION_FIELD_LIMIT.MESSAGE_MAX_LENGTH;

interface AssistantComposerProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  isSending: boolean;
  canStartOver: boolean;
  onStartOver: () => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

const ICON_BUTTON =
  "flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed";

export function AssistantComposer({ value, onValueChange, onSubmit, isSending, canStartOver, onStartOver, textareaRef }: AssistantComposerProps) {
  const popoverId = useId();
  const disclaimerId = useId();
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const rows = Math.min(ASSISTANT_COMPOSER_MAX_ROWS, Math.max(1, value.split("\n").length));
  const canSend = !isSending && value.trim() !== "" && value.trim().length <= MAX_LENGTH;

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (canSend) onSubmit();
  }

  return (
    <div className="sticky bottom-0 z-10 -mx-4 bg-surface/95 px-4 pb-1 pt-3 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="mx-auto w-full max-w-[760px]">
        <div className="rounded-card border border-line-admin bg-surface px-3 py-2.5 shadow-sm focus-within:ring-2 focus-within:ring-accent/30">
          <textarea
            ref={textareaRef}
            rows={rows}
            value={value}
            maxLength={MAX_LENGTH}
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={COPY.composerPlaceholder}
            aria-label={COPY.composerLabel}
            aria-describedby={disclaimerId}
            aria-busy={isSending}
            className="block w-full resize-none bg-transparent px-1 py-1 text-[14px] leading-relaxed text-ink placeholder:text-faint focus:outline-none"
          />
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <div className="relative flex items-center gap-2">
              <button
                type="button"
                aria-expanded={isAboutOpen}
                aria-controls={popoverId}
                onClick={() => setIsAboutOpen((open) => !open)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setIsAboutOpen(false);
                }}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-pill bg-bg px-3 py-1 text-[12px] font-semibold text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <Icon name={IconName.QUESTION} className="h-3.5 w-3.5" />
                {COPY.whatIsThis}
              </button>
              {isAboutOpen && (
                <div
                  id={popoverId}
                  role="dialog"
                  aria-label={COPY.whatIsThisTitle}
                  className="absolute bottom-full left-0 z-20 mb-2 w-[min(320px,80vw)] rounded-card border border-line-admin bg-surface p-4 text-left shadow-lg"
                >
                  <p className="text-[13px] font-semibold text-ink">{COPY.whatIsThisTitle}</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{COPY.whatIsThisBody}</p>
                </div>
              )}
              {canStartOver && (
                <button type="button" onClick={onStartOver} aria-label={COPY.startOver} title={COPY.startOver} className={cn(ICON_BUTTON, "text-muted hover:bg-bg hover:text-ink")}>
                  <Icon name={IconName.REFRESH} className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11.5px] text-faint" aria-live="off">
                {COPY.characterCount(value.length, MAX_LENGTH)}
              </span>
              <button
                type="button"
                onClick={onSubmit}
                disabled={!canSend}
                aria-label={COPY.send}
                className={cn(ICON_BUTTON, "bg-accent text-white hover:bg-accent-hover disabled:bg-slate-200 disabled:text-muted")}
              >
                <Icon name={IconName.SEND} className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
        <p id={disclaimerId} className="mt-2 text-center text-[11.5px] text-faint">
          {COPY.disclaimer}
        </p>
      </div>
    </div>
  );
}
