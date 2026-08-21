import type { RequirementValue } from "../../lib/types/task/requirement.type.js";

export function formatRequirementValue(value: RequirementValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object" && "name" in value && "email" in value) {
    return `${value.name} (${value.email})`;
  }
  return String(value);
}
