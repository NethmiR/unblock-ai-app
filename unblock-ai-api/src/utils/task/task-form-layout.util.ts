import {
  FORM_CONTROL_BY_INPUT_TYPE,
  FORM_FIELD_WIDTH_BY_CONTROL,
  UNSUPPORTED_INPUT_TYPES,
  type CollectableInputType,
  type FormFieldControl,
  type FormFieldWidth,
} from "../../data/constants/task-form.constant.js";
import type { InputType, WorkflowInput } from "../../lib/types/workflow/workflow.type.js";

export interface FieldLayout {
  control: FormFieldControl;
  width: FormFieldWidth;
}

function isCollectable(type: InputType): type is CollectableInputType {
  return !UNSUPPORTED_INPUT_TYPES.includes(type);
}

export function fieldLayoutForInput(input: WorkflowInput): FieldLayout | null {
  if (!isCollectable(input.type)) return null;
  const control = FORM_CONTROL_BY_INPUT_TYPE[input.type];
  return { control, width: FORM_FIELD_WIDTH_BY_CONTROL[control] };
}
