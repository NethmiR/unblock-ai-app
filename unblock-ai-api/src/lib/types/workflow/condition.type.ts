export type NamespaceRoot = "inputs" | "computed" | "steps" | "requester" | "system";

export type NamespacePath = string;

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "greater_than"
  | "less_than"
  | "greater_or_equal"
  | "less_or_equal"
  | "in"
  | "not_in"
  | "exists"
  | "and"
  | "or"
  | "not";

export type ConditionValue = string | number | boolean | null;

export interface ComparisonCondition {
  operator: Exclude<ConditionOperator, "and" | "or" | "not">;
  left: ConditionValue;
  right: ConditionValue;
  clauses: Condition[];
  description: string | null;
}

export interface CompoundCondition {
  operator: "and" | "or" | "not";
  left: ConditionValue;
  right: ConditionValue;
  clauses: Condition[];
  description: string | null;
}

export type Condition = ComparisonCondition | CompoundCondition;
