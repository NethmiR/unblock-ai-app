import type { Request, Response } from "express";
import { WorkflowService } from "../services/workflow.service.js";
import { ExtractionService } from "../services/extraction.service.js";
import { ValidationService } from "../services/validation.service.js";
import {
  optionalPositiveInt,
  optionalString,
  requireNonEmptyString,
  requireObject,
  requireOneOf,
} from "../utils/http/request-validator.util.js";
import { serializeTemplateRecord } from "../utils/http/serializer.util.js";
import { REVIEW_STATUS } from "../data/constants/status.constant.js";
import type { ExtractResponseDto } from "../lib/types/http/http.type.js";
import type { WorkflowDefinition } from "../lib/types/workflow/workflow.type.js";

export interface WorkflowControllerOptions {
  workflowService: WorkflowService;
  extractionService: ExtractionService;
  validationService: ValidationService;
}

export class WorkflowController {
  private readonly workflowService: WorkflowService;
  private readonly extractionService: ExtractionService;
  private readonly validationService: ValidationService;

  constructor({ workflowService, extractionService, validationService }: WorkflowControllerOptions) {
    this.workflowService = workflowService;
    this.extractionService = extractionService;
    this.validationService = validationService;
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
    res.json(serializeTemplateRecord(record));
  };

  setReviewStatus = async (req: Request, res: Response): Promise<void> => {
    const reviewStatus = requireOneOf(req.body, "review_status", Object.values(REVIEW_STATUS));
    const version = optionalPositiveInt(req.body.version, "version");
    const record = await this.workflowService.getRecord(req.params.id as string, version);
    const summary = await this.workflowService.setReviewStatus(record.workflow_id, record.version, reviewStatus);
    res.json(summary);
  };
}
