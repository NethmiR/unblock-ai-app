import type { TaskFieldValue } from "../../lib/types/task/task-value.type.js";

export const BOOLEAN_VALUE_LABEL = { TRUE: "Yes", FALSE: "No" } as const;

export function formatFieldValue(value: TaskFieldValue | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? BOOLEAN_VALUE_LABEL.TRUE : BOOLEAN_VALUE_LABEL.FALSE;
  if (typeof value === "object") return `${value.name} (${value.email})`;
  return String(value);
}
