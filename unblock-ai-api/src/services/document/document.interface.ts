import type { RenderedDocument, TaskTranscript } from "../../lib/types/document/document.type.js";

export interface IDocumentRenderer {
  render(transcript: TaskTranscript): Promise<RenderedDocument>;
}
