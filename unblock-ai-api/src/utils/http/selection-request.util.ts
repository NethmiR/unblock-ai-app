import { SELECTION_FIELD_LIMIT } from "../../data/constants/selection.constant.js";
import { ValidationError } from "../../errors/validation.error.js";
import { requireNonEmptyString } from "./request-validator.util.js";

const MESSAGE_FIELD = "message";

export function parseSelectionMessage(body: unknown): string {
  const message = requireNonEmptyString(body, MESSAGE_FIELD).trim();
  if (message.length > SELECTION_FIELD_LIMIT.MESSAGE_MAX_LENGTH) {
    throw new ValidationError(`'${MESSAGE_FIELD}' must be at most ${SELECTION_FIELD_LIMIT.MESSAGE_MAX_LENGTH} characters`);
  }
  return message;
}
