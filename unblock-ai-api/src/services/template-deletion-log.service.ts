import type { ITemplateDeletionRepository } from "../repositories/template-deletion-repository/template-deletion-repository.interface.js";
import type {
  TemplateDeletionInput,
  TemplateDeletionRecord,
} from "../lib/types/template-deletion/template-deletion.type.js";

export interface TemplateDeletionLogServiceOptions {
  templateDeletionRepository: ITemplateDeletionRepository;
}

export class TemplateDeletionLogService {
  private readonly templateDeletionRepository: ITemplateDeletionRepository;

  constructor({ templateDeletionRepository }: TemplateDeletionLogServiceOptions) {
    this.templateDeletionRepository = templateDeletionRepository;
  }

  record(input: TemplateDeletionInput): Promise<TemplateDeletionRecord> {
    return this.templateDeletionRepository.record(input);
  }

  markCompleted(id: string, versionsRemoved: number): Promise<void> {
    return this.templateDeletionRepository.markCompleted(id, versionsRemoved);
  }

  list(limit: number, workflowId?: string): Promise<TemplateDeletionRecord[]> {
    return this.templateDeletionRepository.list(limit, workflowId);
  }
}
