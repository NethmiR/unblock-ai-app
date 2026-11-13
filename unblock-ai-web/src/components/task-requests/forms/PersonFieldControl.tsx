import { TextInput } from "@/components/ui/form/TextInput";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import type { FieldControlProps } from "@/components/ui/form/FormField";
import type { PersonDraftValue } from "@/lib/task-request/task-form-draft";

const COPY = TASK_REQUEST_COPY.forms;

interface PersonFieldControlProps extends FieldControlProps {
  label: string;
  value: PersonDraftValue;
  onValueChange: (value: PersonDraftValue) => void;
}

export function PersonFieldControl({ id, label, value, onValueChange, ...control }: PersonFieldControlProps) {
  const invalid = control["aria-invalid"] === true;
  return (
    <div role="group" aria-label={label} className="grid gap-2 sm:grid-cols-2">
      <TextInput
        {...control}
        id={id}
        invalid={invalid}
        autoComplete="off"
        placeholder={COPY.personName}
        aria-label={`${label}: ${COPY.personName}`}
        value={value.name}
        onChange={(event) => onValueChange({ ...value, name: event.target.value })}
      />
      <TextInput
        {...control}
        type="email"
        invalid={invalid}
        autoComplete="off"
        placeholder={COPY.personEmail}
        aria-label={`${label}: ${COPY.personEmail}`}
        value={value.email}
        onChange={(event) => onValueChange({ ...value, email: event.target.value })}
      />
    </div>
  );
}
