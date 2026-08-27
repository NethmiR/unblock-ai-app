import type { Request, Response } from "express";
import { WorkflowService } from "../services/workflow.service.js";
import { ExtractionService } from "../services/extraction.service.js";
import { ValidationService } from "../services/validation.service.js";
import { DraftService } from "../services/draft.service.js";
import {
  optionalPositiveInt,
  optionalString,
  requireNonEmptyString,
  requireObject,
  requireOneOf,
} from "../utils/http/request-validator.util.js";
import { ValidationError } from "../errors/validation.error.js";
import { UnauthorizedError } from "../errors/unauthorized.error.js";
import { serializeTemplateRecord } from "../utils/http/serializer.util.js";
import { REVIEW_STATUS } from "../data/constants/status.constant.js";
import type { ExtractResponseDto } from "../lib/types/http/http.type.js";
import type { WorkflowDefinition } from "../lib/types/workflow/workflow.type.js";

export interface WorkflowControllerOptions {
  workflowService: WorkflowService;
  extractionService: ExtractionService;
  validationService: ValidationService;
  draftService: DraftService;
}

export class WorkflowController {
  private readonly workflowService: WorkflowService;
  private readonly extractionService: ExtractionService;
  private readonly validationService: ValidationService;
  private readonly draftService: DraftService;

  constructor({ workflowService, extractionService, validationService, draftService }: WorkflowControllerOptions) {
    this.workflowService = workflowService;
    this.extractionService = extractionService;
    this.validationService = validationService;
    this.draftService = draftService;
  }

  extract = async (req: Request, res: Response): Promise<void> => {
    const text = requireNonEmptyString(req.body, "text");
    const { workflow, attempts } = await this.extractionService.extract(text);
    const response: ExtractResponseDto = { workflow, validation: { valid: true, errors: [] }, attempts };
    res.json(response);
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const workflow = requireObject<WorkflowDefinition>(req.body, "workflow");
    this.validationService.assertValid(workflow);
    const result = await this.workflowService.save(workflow);
    res.status(201).json(result);
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const institutionType = optionalString(req.query, "institution_type");
    const summaries = await this.workflowService.list(institutionType ? { institution_type: institutionType } : {});
    res.json(summaries);
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const version = optionalPositiveInt(req.query.version, "version");
    const workflow = await this.workflowService.getDocument(req.params.id as string, version);
    res.json(workflow);
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const workflow = requireObject<WorkflowDefinition>(req.body, "workflow");
    this.validationService.assertValid(workflow);
    const result = await this.workflowService.update(req.params.id as string, workflow);
    res.json(result);
  };

  validate = async (req: Request, res: Response): Promise<void> => {
    const workflow = requireObject<WorkflowDefinition>(req.body, "workflow");
    const errors = this.validationService.validate(workflow);
    res.json({ valid: errors.length === 0, errors });
  };

  getRecord = async (req: Request, res: Response): Promise<void> => {
    const version = optionalPositiveInt(req.query.version, "version");
    const record = await this.workflowService.getRecord(req.params.id as string, version);

    // A missing or malformed draft must NOT 404 the template. The template is the
    // real resource; the prose is a convenience for the left panel. Previously the
    // web layer turned a DATABASE_ERROR here into notFound(), which meant one bad
    // draft_id made a perfectly good template unopenable.
    let draftText: string | null = null;
    if (record.draft_id) {
      try {
        const draft = await this.draftService.findById(String(record.draft_id));
        draftText = draft?.raw_text ?? null;
      } catch {
        draftText = null;
      }
    }

    res.json(serializeTemplateRecord(record, draftText));
  };

  /**
   * `DELETE /workflows/:id` - permanent, and gated on a typed confirmation.
   *
   * The admin UI asks for the word "delete" and then the template's exact
   * title; both are re-checked here so the guard survives anything that calls
   * the API directly. Titles are compared case-insensitively and
   * whitespace-normalised - the intent is to prove the admin knows WHICH
   * template this is, not to test their typing.
   */
  remove = async (req: Request, res: Response): Promise<void> => {
    const workflowId = req.params.id as string;
    const record = await this.workflowService.getRecord(workflowId);

    const confirmation = requireNonEmptyString(req.body, "confirmation");
    if (confirmation.trim().toLowerCase() !== "delete") {
      throw new ValidationError("confirmation must be the word 'delete'");
    }

    const confirmTitle = requireNonEmptyString(req.body, "confirm_title");
    if (normalise(confirmTitle) !== normalise(record.title)) {
      throw new ValidationError("confirm_title must exactly match the template title");
    }

    // `requireRole("admin")` on this route already guarantees req.user - this
    // guard is just so the type stays `AuthUser`, not `AuthUser | undefined`.
    if (!req.user) throw new UnauthorizedError("Authentication required");

    await this.workflowService.delete(workflowId, req.user, req.requestId);
    res.status(204).send();
  };

  /** `GET /workflows/deletions` - the admin-only template deletion log, newest first. */
  listDeletions = async (req: Request, res: Response): Promise<void> => {
    const limit = optionalPositiveInt(req.query.limit, "limit") ?? 50;
    const workflowId = optionalString(req.query, "workflow_id");
    const deletions = await this.workflowService.listDeletions(limit, workflowId ?? undefined);
    res.json(deletions);
  };

  setReviewStatus = async (req: Request, res: Response): Promise<void> => {
    const reviewStatus = requireOneOf(req.body, "review_status", Object.values(REVIEW_STATUS));
    const version = optionalPositiveInt(req.body.version, "version");
    const record = await this.workflowService.getRecord(req.params.id as string, version);
    const summary = await this.workflowService.setReviewStatus(record.workflow_id, record.version, reviewStatus);
    res.json(summary);
  };
}

/** Case- and whitespace-insensitive, so the check reads intent rather than keystrokes. */
function normalise(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
