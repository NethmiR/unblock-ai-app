"use client";
import { useId } from "react";
import { WorkspacePanel } from "./WorkspacePanel";
import { WORKFLOW_TEMPLATE_COPY } from "@/lib/workflow-template/workflow-template-copy";
import { WORKFLOW_TEMPLATE_FIELD_LIMIT } from "@/lib/workflow-template/workflow-template-field-limit";
import { countWords } from "@/lib/utils/format";

const COPY = WORKFLOW_TEMPLATE_COPY.editor;

interface WorkflowTemplatePromptPanelProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  error?: string | null;
}

export function WorkflowTemplatePromptPanel({ value, onChange, readOnly = false, error = null }: WorkflowTemplatePromptPanelProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <WorkspacePanel heading={COPY.promptHeading} meta={COPY.wordCount(countWords(value))}>
      <label htmlFor={id} className="sr-only">
        {COPY.promptLabel}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        readOnly={readOnly}
        placeholder={COPY.promptPlaceholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        maxLength={WORKFLOW_TEMPLATE_FIELD_LIMIT.PROMPT_MAX_LENGTH}
        spellCheck
        className="min-h-0 flex-1 resize-none bg-transparent px-5 py-4 text-[14.5px] leading-[1.75] text-ink outline-none placeholder:text-faint read-only:text-muted"
      />
      {error && (
        <p id={errorId} role="alert" className="border-t border-line-admin px-5 py-2.5 text-[12px] text-danger">
          {error}
        </p>
      )}
    </WorkspacePanel>
  );
}
