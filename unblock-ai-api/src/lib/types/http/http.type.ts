import type { ReviewStatus, WorkflowDefinition } from "../workflow/workflow.type.js";
import type { AuthUser } from "../auth/auth.type.js";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      /** Set by `authenticate` when a valid bearer token is present. */
      user?: AuthUser;
    }
  }
}

export interface ErrorResponseBody {
  error: string;
  code: string;
  details: unknown;
}

export interface ValidationResultDto {
  valid: boolean;
  errors: string[];
}

export interface ExtractResponseDto {
  workflow: WorkflowDefinition;
  validation: ValidationResultDto;
  attempts: number;
}

export interface DraftExtractResponseDto {
  draft_id: string;
  workflow_id: string;
  version: number;
  attempts: number;
  review_status: ReviewStatus;
  workflow: WorkflowDefinition;
}
