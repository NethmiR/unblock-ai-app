import type { InputType, InputValidation } from "../workflow/workflow.type.js";

export type RequirementSource = "input" | "actor";
export type RequirementStatus = "pending" | "filled" | "skipped";

export interface PersonValue {
  name: string;
  email: string;
}

export type RequirementValue = string | number | boolean | PersonValue | null;

export interface TaskRequirement {
  key: string;
  source: RequirementSource;
  ref: string;
  label: string;
  description: string | null;
  type: InputType | "person";
  required: boolean;
  validation: InputValidation | null;
  collection_hint: string | null;
  status: RequirementStatus;
}
