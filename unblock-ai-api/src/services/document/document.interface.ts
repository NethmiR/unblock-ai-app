import type { CompletionDocument, RenderedDocument } from "../../lib/types/document/document.type.js";

export interface IDocumentRenderer {
  render(doc: CompletionDocument): Promise<RenderedDocument>;
}
