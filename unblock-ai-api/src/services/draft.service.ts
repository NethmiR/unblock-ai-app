import type { ObjectId } from "mongodb";
import { DraftModel } from "../models/draft.model.js";
import { sha256 } from "../utils/shared/hash.util.js";
import { logger } from "../utils/shared/logger.util.js";
import { DRAFT_STATUS } from "../data/constants/status.constant.js";
import { NotFoundError } from "../errors/not-found.error.js";
import type { CreateDraftInput, DraftDocument } from "../lib/types/draft/draft.type.js";

export interface DraftServiceOptions {
  draftModel: DraftModel;
}

export class DraftService {
  private readonly draftModel: DraftModel;

  constructor({ draftModel }: DraftServiceOptions) {
    this.draftModel = draftModel;
  }

  async create(input: CreateDraftInput): Promise<DraftDocument> {
    const textSha = sha256(input.rawText);

    const existing = await this.draftModel.findByTextHash(textSha);
    if (existing) {
      logger.debug("draft already exists", { id: existing._id.toString() });
      return existing;
    }

    const now = new Date();
    const doc: Omit<DraftDocument, "_id"> = {
      raw_text: input.rawText,
      text_sha256: textSha,
      title: input.title ?? null,
      submitted_by: input.submittedBy ?? null,
      status: DRAFT_STATUS.PENDING,
      failure_reason: null,
      workflow_id: null,
      created_at: now,
      updated_at: now,
    };

    const inserted = await this.draftModel.insert(doc);
    logger.info("draft created", { id: inserted._id.toString() });
    return inserted;
  }

  async getById(id: string | ObjectId): Promise<DraftDocument> {
    const draft = await this.draftModel.findById(id);
    if (!draft) throw NotFoundError.of("Draft", String(id));
    return draft;
  }

  findById(id: string | ObjectId): Promise<DraftDocument | null> {
    return this.draftModel.findById(id);
  }

  list(options: { limit?: number } = {}): Promise<DraftDocument[]> {
    return this.draftModel.findAll({ limit: options.limit ?? 50 });
  }

  markExtracted(id: string | ObjectId, workflowId: string): Promise<DraftDocument | null> {
    return this.draftModel.patch(id, {
      status: DRAFT_STATUS.EXTRACTED,
      workflow_id: workflowId,
      failure_reason: null,
    });
  }

  markFailed(id: string | ObjectId, reason: unknown): Promise<DraftDocument | null> {
    return this.draftModel.patch(id, {
      status: DRAFT_STATUS.FAILED,
      failure_reason: String(reason).slice(0, 2000),
    });
  }

  markRejected(id: string | ObjectId, reason: unknown): Promise<DraftDocument | null> {
    return this.draftModel.patch(id, {
      status: DRAFT_STATUS.REJECTED,
      failure_reason: String(reason).slice(0, 2000),
    });
  }
}
