import { TaskFormFieldControl } from "./TaskFormFieldControl";
import { cn } from "@/lib/utils/cn";
import { FormFieldWidth, type FormFieldIssueDto, type TaskFormDto } from "@/types/task-form";
import type { TaskFormDraftValue } from "@/lib/task-request/task-form-draft";

interface TaskFormProps {
  form: TaskFormDto;
  readOnly: boolean;
  values: Readonly<Record<string, TaskFormDraftValue>>;
  issues: Readonly<Record<string, FormFieldIssueDto>>;
  onChange: (fieldId: string, value: TaskFormDraftValue) => void;
}

export function TaskForm({ form, readOnly, values, issues, onChange }: TaskFormProps) {
  return (
    <div className="space-y-6">
      {form.sections.map((section) => (
        <section key={section.id} aria-labelledby={`${form.id}-${section.id}`}>
          <h3 id={`${form.id}-${section.id}`} className="mb-3 text-[11px] font-bold uppercase tracking-[.07em] text-muted">
            {section.title}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {section.fields.map((field) => (
              <div key={field.id} className={cn(field.width === FormFieldWidth.FULL && "sm:col-span-2")}>
                <TaskFormFieldControl
                  field={field}
                  value={values[field.id]}
                  issue={issues[field.id]}
                  readOnly={readOnly}
                  onChange={(value) => onChange(field.id, value)}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
