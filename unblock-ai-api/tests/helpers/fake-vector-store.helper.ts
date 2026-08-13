import type { ITemplateReader } from "../../src/lib/types/retrieval/retrieval.type.js";
import type { RetrievalProjection } from "../../src/lib/types/template/template.type.js";

export class FakeTemplateReader implements ITemplateReader {
  readonly rows: RetrievalProjection[];
  readonly calls: Array<{ institutionType?: string | null }> = [];

  constructor(rows: RetrievalProjection[]) {
    this.rows = rows;
  }

  listForRetrieval(options: { institutionType?: string | null }): Promise<RetrievalProjection[]> {
    this.calls.push(options);
    return Promise.resolve(this.rows);
  }
}
