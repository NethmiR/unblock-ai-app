import type { Request, Response } from "express";
import { SelectionService } from "../services/selection.service.js";
import {
  optionalObject,
  optionalString,
  requireNonEmptyString,
  requireUuidField,
} from "../utils/http/request-validator.util.js";

export interface SelectionControllerOptions {
  selectionService: SelectionService;
}

export class SelectionController {
  private readonly selectionService: SelectionService;

  constructor({ selectionService }: SelectionControllerOptions) {
    this.selectionService = selectionService;
  }

  startSession = async (req: Request, res: Response): Promise<void> => {
    const query = requireNonEmptyString(req.body, "query");
    const requesterContext = optionalObject(req.body, "requester_context");
    const institutionType = optionalString(req.body, "institution_type");
    const result = await this.selectionService.start(query, {
      requesterContext,
      institutionType,
    });
    res.status(201).json(result);
  };

  answerQuestion = async (req: Request, res: Response): Promise<void> => {
    const answer = requireNonEmptyString(req.body, "answer");
    const result = await this.selectionService.answer(req.params.id as string, answer);
    res.json(result);
  };

  chooseWorkflowTemplate = async (req: Request, res: Response): Promise<void> => {
    const workflowTemplateId = requireUuidField(req.body, "workflow_template_id");
    const result = await this.selectionService.choose(req.params.id as string, workflowTemplateId);
    res.json(result);
  };

  getMatchedWorkflowTemplate = async (req: Request, res: Response): Promise<void> => {
    const { version, definition } = await this.selectionService.getMatchedWorkflowTemplate(req.params.id as string);
    res.json({ workflow_template_version: version, definition });
  };
}
