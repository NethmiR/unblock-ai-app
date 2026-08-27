"use client";
import { useEffect, useRef } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatComposer } from "./ChatComposer";
import type { ChatMessage as Message } from "@/lib/hooks/useSelectionSession";
import type { SelectionResponse } from "@/types/selection";

interface Props {
  messages: Message[];
  decision: SelectionResponse | null;
  isBusy: boolean;
  hasStarted: boolean;
  isClosed: boolean;
  onSend: (text: string) => void;
  onChoose: (workflowId: string) => void;
}

/**
 * The full-width chat pane.
 *
 * Presentational only - all conversational state lives in useSelectionSession.
 * The one piece of judgment this component makes: a quick-reply click on a
 * `manual_choice` message is a pick from the candidate list (workflow_id, via
 * `onChoose`), while every other quick reply is free text sent through the
 * same `send` path as typing it would be (per ChatMessage's contract that
 * typing and clicking must produce the same result).
 *
 * `isClosed` retires the composer once a workflow has matched. Note that
 * `no_match` deliberately does NOT close the chat - that branch asks the
 * person to rephrase, so the input has to stay live for them to answer.
 */
export function SelectionChat({
  messages,
  decision,
  isBusy,
  hasStarted,
  isClosed,
  onSend,
  onChoose,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  function handleOptionClick(option: string) {
    if (decision?.decision === "manual_choice") {
      const candidate = decision.candidates.find((c) => c.title === option);
      if (candidate) {
        onChoose(candidate.workflow_id);
        return;
      }
    }
    onSend(option);
  }

  const isLastMessage = (i: number) => i === messages.length - 1;

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-sm">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-[26px] py-7">
        {!hasStarted ? (
          <div className="flex h-full flex-col items-center justify-center px-3 text-center">
            <div className="text-[26px] font-semibold leading-tight tracking-tight">
              Tell us what you want to do.
            </div>
            <p className="mt-3 max-w-[34ch] text-[14.5px] leading-relaxed text-muted">
              Overseas leave, a verification letter, a hall booking — describe it in your own
              words.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((message, i) => (
              <ChatMessage
                key={message.id}
                message={message}
                onOptionClick={handleOptionClick}
                disabled={isBusy || isClosed || !isLastMessage(i)}
              />
            ))}
          </div>
        )}
      </div>

      <ChatComposer onSend={onSend} disabled={isBusy} closed={isClosed} />
    </div>
  );
}
