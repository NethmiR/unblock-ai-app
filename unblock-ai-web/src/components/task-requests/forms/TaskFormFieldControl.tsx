"use client";
import { FormField, type FieldControlProps } from "@/components/ui/form/FormField";
import { Select } from "@/components/ui/form/Select";
import { Switch } from "@/components/ui/form/Switch";
import { TextArea } from "@/components/ui/form/TextArea";
import { TextInput } from "@/components/ui/form/TextInput";
import { LockedFieldValue } from "./LockedFieldValue";
import { PersonFieldControl } from "./PersonFieldControl";
import { formatFieldValue } from "@/lib/task-request/task-field-format";
import { taskFieldIssueMessage } from "@/lib/task-request/task-field-issue-message";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { FormFieldControl, FormFieldValueSource, type FormFieldIssueDto, type TaskFormFieldDto } from "@/types/task-form";
import type { PersonDraftValue, TaskFormDraftValue } from "@/lib/task-request/task-form-draft";

const COPY = TASK_REQUEST_COPY.forms;
const EMPTY_PERSON: PersonDraftValue = { name: "", email: "" };

const LOCKED_HINTS: Record<FormFieldValueSource, string> = {
  [FormFieldValueSource.REQUESTER_PROFILE]: COPY.lockedHint.requester_profile,
  [FormFieldValueSource.DIRECTORY]: COPY.lockedHint.directory,
  [FormFieldValueSource.REQUESTER]: COPY.lockedHint.requester,
};

interface TaskFormFieldControlProps {
  field: TaskFormFieldDto;
  value: TaskFormDraftValue | undefined;
  issue: FormFieldIssueDto | undefined;
  readOnly: boolean;
  onChange: (value: TaskFormDraftValue) => void;
}

function asText(value: TaskFormDraftValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function EditableControl({ field, value, onChange, control }: Omit<TaskFormFieldControlProps, "issue" | "readOnly"> & { control: FieldControlProps }) {
  const invalid = control["aria-invalid"] === true;
  const text = asText(value);
  const onText = (next: string) => onChange(next);
  const maxLength = field.validation?.max_length ?? undefined;

  switch (field.control) {
    case FormFieldControl.TEXT:
      return <TextInput {...control} invalid={invalid} maxLength={maxLength} value={text} onChange={(event) => onText(event.target.value)} />;
    case FormFieldControl.EMAIL:
      return <TextInput {...control} type="email" invalid={invalid} value={text} onChange={(event) => onText(event.target.value)} />;
    case FormFieldControl.PHONE:
      return <TextInput {...control} type="tel" inputMode="tel" invalid={invalid} value={text} onChange={(event) => onText(event.target.value)} />;
    case FormFieldControl.NUMBER:
      return <TextInput {...control} inputMode="decimal" invalid={invalid} value={text} onChange={(event) => onText(event.target.value)} />;
    case FormFieldControl.DATE:
      return <TextInput {...control} type="date" invalid={invalid} value={text} onChange={(event) => onText(event.target.value)} />;
    case FormFieldControl.DATETIME:
      return <TextInput {...control} type="datetime-local" invalid={invalid} value={text} onChange={(event) => onText(event.target.value)} />;
    case FormFieldControl.TEXTAREA:
      return <TextArea {...control} rows={4} invalid={invalid} maxLength={maxLength} value={text} onChange={(event) => onText(event.target.value)} />;
    case FormFieldControl.SELECT:
      return (
        <Select
          {...control}
          invalid={invalid}
          value={text}
          options={[{ value: "", label: COPY.selectPlaceholder }, ...field.options.map((option) => ({ value: option.value, label: option.label }))]}
          onValueChange={onText}
        />
      );
    case FormFieldControl.PERSON:
      return (
        <PersonFieldControl
          {...control}
          label={field.label}
          value={typeof value === "object" ? value : EMPTY_PERSON}
          onValueChange={(next) => onChange(next)}
        />
      );
    case FormFieldControl.SWITCH:
      return null;
    default: {
      const unreachable: never = field.control;
      return unreachable;
    }
  }
}

export function TaskFormFieldControl({ field, value, issue, readOnly, onChange }: TaskFormFieldControlProps) {
  const error = issue ? taskFieldIssueMessage(issue) : null;

  if (field.locked || readOnly) {
    return (
      <FormField label={field.label} hint={field.locked ? LOCKED_HINTS[field.value_source] : (field.description ?? undefined)}>
        {(control) => <LockedFieldValue {...control} text={formatFieldValue(field)} locked={field.locked} />}
      </FormField>
    );
  }

  if (field.control === FormFieldControl.SWITCH) {
    return (
      <div className="flex flex-col gap-1.5">
        <Switch checked={value === true} onCheckedChange={(checked) => onChange(checked)} label={field.label} description={field.description ?? undefined} />
        {error && (
          <p role="alert" className="text-[12px] text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <FormField label={field.label} hint={field.description ?? undefined} error={error} required={field.required}>
      {(control) => <EditableControl field={field} value={value} onChange={onChange} control={control} />}
    </FormField>
  );
}
