import { TASK_REQUEST_COPY } from "./task-request-copy";
import { FormFieldControl, type TaskFormFieldDto } from "@/types/task-form";

const FORMS = TASK_REQUEST_COPY.forms;

export function formatFieldValue(field: Pick<TaskFormFieldDto, "control" | "options" | "value">): string {
  const value = field.value;
  if (value === null) return FORMS.emptyValue;
  if (typeof value === "boolean") return value ? FORMS.switchOn : FORMS.switchOff;
  if (typeof value === "object") return value.email ? `${value.name} (${value.email})` : value.name;
  if (field.control === FormFieldControl.SELECT) {
    return field.options.find((option) => option.value === value)?.label ?? String(value);
  }
  const text = String(value);
  return text.trim() === "" ? FORMS.emptyValue : text;
}
