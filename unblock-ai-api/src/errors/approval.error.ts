import { ConflictError } from "./conflict.error.js";
import { GoneError } from "./gone.error.js";
import { NotFoundError } from "./not-found.error.js";
import { ValidationError } from "./validation.error.js";
import { ApprovalErrorCode } from "../data/constants/approval-error.constant.js";
import type { ApprovalDecision } from "../data/constants/task.constant.js";

export function approvalLinkInvalid(): NotFoundError {
  return new NotFoundError("This approval link is not valid", { code: ApprovalErrorCode.APPROVAL_LINK_INVALID });
}

export function approvalLinkExpired(): GoneError {
  return new GoneError("This approval link has expired", { code: ApprovalErrorCode.APPROVAL_LINK_EXPIRED });
}

export function approvalAlreadyDecided(): ConflictError {
  return new ConflictError("A decision has already been recorded for this step", {
    code: ApprovalErrorCode.APPROVAL_ALREADY_DECIDED,
  });
}

export function approvalDecisionNotAllowed(decision: ApprovalDecision): ValidationError {
  return new ValidationError(`The decision '${decision}' is not available for this step`, {
    code: ApprovalErrorCode.APPROVAL_DECISION_NOT_ALLOWED,
  });
}

export function approvalCommentRequired(decision: ApprovalDecision): ValidationError {
  return new ValidationError(`A comment is required to record '${decision}'`, {
    code: ApprovalErrorCode.APPROVAL_COMMENT_REQUIRED,
  });
}
