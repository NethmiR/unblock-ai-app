import { PdfDocumentRenderer } from "./pdf.document.js";
import { TextDocumentRenderer } from "./text.document.js";
import { ConfigurationError } from "../../errors/configuration.error.js";
import type { IDocumentRenderer } from "./document.interface.js";
import type { DocumentConfig } from "../../lib/types/config/config.type.js";

export { PdfDocumentRenderer } from "./pdf.document.js";
export { TextDocumentRenderer } from "./text.document.js";
export type { IDocumentRenderer } from "./document.interface.js";

export function createDocumentRenderer(format: DocumentConfig["format"]): IDocumentRenderer {
  if (format === "pdf") {
    return new PdfDocumentRenderer();
  }
  if (format === "text") {
    return new TextDocumentRenderer();
  }
  throw new ConfigurationError(`Unknown document format '${format}'`);
}
