export interface PersonValue {
  user_id: string | null;
  name: string;
  email: string;
}

export type TaskFieldValue = string | number | boolean | PersonValue | null;

export type ConditionNamespace = ReadonlyMap<string, TaskFieldValue>;
