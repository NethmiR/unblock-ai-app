"use client";
import { useState, type FormEvent } from "react";

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
  closed?: boolean;
  closedNotice?: string;
  placeholder?: string;
}

/**
 * The message input bar.
 *
 * An LLM round-trip is 1-3 seconds, so `disabled` (driven by `isBusy` in the
 * parent) both blocks the send button and shows a "Thinking…" hint - an
 * unresponsive input with no feedback reads as broken, not busy.
 *
 * `closed` is the different, terminal case: the selection conversation is over
 * because a workflow matched. The backend has finalized the session and will
 * reject any further POST to /answer with "No open question to answer on this
 * session", so the input must stop inviting text it can no longer deliver -
 * and say where the remaining input actually goes.
 */
export function ChatComposer({
  onSend,
  disabled,
  closed,
  closedNotice = "Workflow selected — press Continue on the right to enter your details.",
  placeholder = "Type your answer…",
}: Props) {
  const [value, setValue] = useState("");

  const isLocked = disabled || closed;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = value.trim();
    if (!text || isLocked) return;
    onSend(text);
    setValue("");
  }

  if (closed) {
    return (
      <div
        role="status"
        className="flex-none border-t border-line px-[18px] py-4 text-[13.5px] leading-relaxed text-muted"
      >
        {closedNotice}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex-none border-t border-line px-[18px] py-4">
      <div className="flex items-center gap-2.5 rounded-card border border-line-admin bg-surface py-1.5 pl-4 pr-1.5">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={isLocked}
          placeholder={disabled ? "Thinking…" : placeholder}
          className="flex-1 bg-transparent py-2.5 text-[14.5px] text-ink placeholder:text-faint focus:outline-none disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={isLocked || value.trim().length === 0}
          aria-label="Send"
          className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-control bg-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-slate-200"
        >
          <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden>
            <path
              d="M9 14.5V3.5M4 8.5L9 3.5l5 5"
              stroke="#fff"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </form>
  );
}
