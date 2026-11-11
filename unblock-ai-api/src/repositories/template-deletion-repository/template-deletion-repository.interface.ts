import type {
  TemplateDeletionInput,
  TemplateDeletionRecord,
} from "../../lib/types/template-deletion/template-deletion.type.js";

export interface ITemplateDeletionRepository {
  record(input: TemplateDeletionInput): Promise<TemplateDeletionRecord>;
  markCompleted(id: string, versionsRemoved: number): Promise<void>;
  list(limit: number, workflowId?: string): Promise<TemplateDeletionRecord[]>;
}
