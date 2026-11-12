import type { IWorkflowTemplateRetrievalReader } from "../../src/lib/types/retrieval/retrieval.type.js";
import type { WorkflowTemplateRetrievalProjection } from "../../src/lib/types/workflow-template/workflow-template.type.js";

export class FakeRetrievalReader implements IWorkflowTemplateRetrievalReader {
  readonly rows: WorkflowTemplateRetrievalProjection[];
  readonly calls: Array<{ institutionType?: string | null }> = [];

  constructor(rows: WorkflowTemplateRetrievalProjection[]) {
    this.rows = rows;
  }

  listForRetrieval(options: { institutionType?: string | null }): Promise<WorkflowTemplateRetrievalProjection[]> {
    this.calls.push(options);
    return Promise.resolve(this.rows);
  }
}
