import type { Request, Response } from "express";
import { DraftService } from "../services/draft.service.js";
import { ExtractionService } from "../services/extraction.service.js";
import { WorkflowService } from "../services/workflow.service.js";
import { optionalString, requireNonEmptyString } from "../utils/http/request-validator.util.js";
import { serializeDraft } from "../utils/http/serializer.util.js";
import { ExtractionError } from "../errors/extraction.error.js";
import type { DraftExtractResponseDto } from "../lib/types/http/http.type.js";

const REJECTED_MESSAGE_PATTERN = /does not describe a workflow/i;

export interface DraftControllerOptions {
  draftService: DraftService;
  extractionService: ExtractionService;
  workflowService: WorkflowService;
}

export class DraftController {
  private readonly draftService: DraftService;
  private readonly extractionService: ExtractionService;
  private readonly workflowService: WorkflowService;

  constructor({ draftService, extractionService, workflowService }: DraftControllerOptions) {
    this.draftService = draftService;
    this.extractionService = extractionService;
    this.workflowService = workflowService;
  }

  create = async (req: Request, res: Response): Promise<void> => {
    const text = requireNonEmptyString(req.body, "text");
    const title = optionalString(req.body, "title");
    // No auth middleware exists yet, so there is no req.user to read a submitter from.
    const submittedBy: string | null = null;
    const draft = await this.draftService.create({ rawText: text, title, submittedBy });
    res.status(201).json(serializeDraft(draft));
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const drafts = await this.draftService.list();
    res.json(drafts.map(serializeDraft));
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const draft = await this.draftService.getById(req.params.id as string);
    res.json(serializeDraft(draft));
  };

  /**
   * `POST /drafts/:id/extract` - compile the draft's prose into a workflow.
   *
   * An optional `title` in the body overrides the one the model infers. The
   * admin editor always sends the title currently on screen, because without it
   * every regeneration re-invents a title from the prose and silently reverts a
   * rename the admin made through `PATCH /workflows/:id/title`. The override is
   * applied after extraction and after validation: `title` is a free-form
   * string in the schema, so substituting it cannot invalidate the document.
   */
  extractFromDraft = async (req: Request, res: Response): Promise<void> => {
    const draft = await this.draftService.getById(req.params.id as string);
    const titleOverride = optionalString(req.body, "title")?.trim();

    try {
      const { workflow: extracted, attempts } = await this.extractionService.extract(draft.raw_text);
      const workflow = titleOverride ? { ...extracted, title: titleOverride } : extracted;
      const saved = await this.workflowService.save(workflow, { draftId: draft._id });
      await this.draftService.markExtracted(draft._id, workflow.workflow_id);

      const response: DraftExtractResponseDto = {
        draft_id: String(draft._id),
        workflow_id: saved.id,
        version: saved.version,
        attempts,
        review_status: workflow.metadata.review_status,
        workflow,
      };
      res.status(201).json(response);
    } catch (err) {
      if (err instanceof ExtractionError) {
        if (REJECTED_MESSAGE_PATTERN.test(err.message)) {
          await this.draftService.markRejected(draft._id, err.message);
        } else {
          await this.draftService.markFailed(draft._id, err.message);
        }
      }
      throw err;
    }
  };
}
