"use client";
import { EditorToolbar } from "./EditorToolbar";
import type { EditorState } from "@/lib/workflow/editorState";

interface Props {
  value: string;
  onChange: (v: string) => void;
  state: EditorState;
  wordCount: number;
}

/** The left panel: header, inert toolbar, and the actual textarea. */
export function DraftEditor({ value, onChange, state, wordCount }: Props) {
  const meta = {
    empty: "0 words",
    typed: `${wordCount} words · draft not saved`,
    generated: `${wordCount} words`,
    edited: `${wordCount} words · unsaved edit`,
  }[state];

  return (
    <section className="flex h-[calc(100vh-200px)] min-h-[520px] flex-col overflow-hidden rounded-card border border-line-admin bg-surface">
      <header className="flex items-center justify-between border-b border-line-admin px-[18px] py-[13px]">
        <span className="text-[11px] font-bold uppercase tracking-[.07em] text-muted">
          What you wrote
        </span>
        <span className="text-[11.5px] text-muted">{meta}</span>
      </header>

      <EditorToolbar />

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter your workflow in plain text"
        spellCheck
        className="flex-1 resize-none px-[30px] pb-10 pt-[26px] text-[15px] leading-[1.78] text-ink outline-none placeholder:text-muted/65"
      />
    </section>
  );
}
