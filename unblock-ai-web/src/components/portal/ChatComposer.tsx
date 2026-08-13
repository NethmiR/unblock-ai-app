"use client";
import { useState, type FormEvent } from "react";

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * The message input bar.
 *
 * An LLM round-trip is 1-3 seconds, so `disabled` (driven by `isBusy` in the
 * parent) both blocks the send button and shows a "Thinking…" hint - an
 * unresponsive input with no feedback reads as broken, not busy.
 */
export function ChatComposer({ onSend, disabled, placeholder = "Type your answer…" }: Props) {
  const [value, setValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex-none border-t border-line px-[18px] py-4">
      <div className="flex items-center gap-2.5 rounded-card border border-line-admin bg-surface py-1.5 pl-4 pr-1.5">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          placeholder={disabled ? "Thinking…" : placeholder}
          className="flex-1 bg-transparent py-2.5 text-[14.5px] text-ink placeholder:text-faint focus:outline-none disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={disabled || value.trim().length === 0}
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
