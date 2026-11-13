import type { Request, Response } from "express";
import { requireUuidField } from "../utils/http/request-validator.util.js";
import { requireAuthContext } from "../utils/http/auth-context.util.js";
import { parseSelectionMessage } from "../utils/http/selection-request.util.js";
import { serializeSelectionCatalogue, serializeSelectionSession } from "../utils/http/selection-serializer.util.js";
import type { SelectionService } from "../services/selection.service.js";

export interface SelectionControllerOptions {
  selectionService: Pick<SelectionService, "start" | "get" | "postMessage" | "choose" | "discard" | "catalogue">;
}

function sessionIdOf(req: Request): string {
  return String(req.params.id);
}

export class SelectionController {
  private readonly selectionService: SelectionControllerOptions["selectionService"];

  constructor({ selectionService }: SelectionControllerOptions) {
    this.selectionService = selectionService;
  }

  startSession = async (req: Request, res: Response): Promise<void> => {
    const message = parseSelectionMessage(req.body);
    const view = await this.selectionService.start(requireAuthContext(req).user.id, message);
    res.status(201).json(serializeSelectionSession(view));
  };

  getSession = async (req: Request, res: Response): Promise<void> => {
    const view = await this.selectionService.get(sessionIdOf(req), requireAuthContext(req).user.id);
    res.json(serializeSelectionSession(view));
  };

  postMessage = async (req: Request, res: Response): Promise<void> => {
    const message = parseSelectionMessage(req.body);
    const view = await this.selectionService.postMessage(sessionIdOf(req), requireAuthContext(req).user.id, message);
    res.json(serializeSelectionSession(view));
  };

  chooseWorkflowTemplate = async (req: Request, res: Response): Promise<void> => {
    const workflowTemplateId = requireUuidField(req.body, "workflow_template_id");
    const view = await this.selectionService.choose(sessionIdOf(req), requireAuthContext(req).user.id, workflowTemplateId);
    res.json(serializeSelectionSession(view));
  };

  discardSession = async (req: Request, res: Response): Promise<void> => {
    await this.selectionService.discard(sessionIdOf(req), requireAuthContext(req).user.id);
    res.status(204).end();
  };

  getCatalogue = async (req: Request, res: Response): Promise<void> => {
    const overviews = await this.selectionService.catalogue(requireAuthContext(req).user.id);
    res.json(serializeSelectionCatalogue(overviews));
  };
}
