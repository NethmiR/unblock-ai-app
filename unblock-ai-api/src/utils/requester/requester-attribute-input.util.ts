import {
  REQUESTER_ATTRIBUTE_INPUT_ALIASES,
  REQUESTER_ATTRIBUTES,
  RequesterAttribute,
} from "../../data/constants/requester.constant.js";
import type { ActorResolution } from "../../lib/types/workflow/actor.type.js";
import type { InputType, WorkflowInput } from "../../lib/types/workflow/workflow.type.js";

const REQUESTER_RESOLUTION: ActorResolution = "requester";
const EMAIL_INPUT_TYPE: InputType = "email";

export function matchRequesterAttribute(input: WorkflowInput): RequesterAttribute | null {
  if (input.collected_from.resolution !== REQUESTER_RESOLUTION) return null;
  const inputId = input.id.trim().toLowerCase();
  const attribute = REQUESTER_ATTRIBUTES.find((candidate) => REQUESTER_ATTRIBUTE_INPUT_ALIASES[candidate].includes(inputId));
  if (attribute === undefined) return null;
  if (attribute === RequesterAttribute.EMAIL && input.type !== EMAIL_INPUT_TYPE) return null;
  return attribute;
}
