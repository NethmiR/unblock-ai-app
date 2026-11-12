import path from "node:path";
import { expectedFixtureNames, loadExpectedFixture } from "./fixture.helper.js";
import { renderAliasesLower, renderForEmbedding } from "../../src/utils/retrieval/render-summary.util.js";
import type { EmbeddingService } from "../../src/services/embedding.service.js";
import type { IWorkflowTemplateRetrievalReader } from "../../src/lib/types/retrieval/retrieval.type.js";
import type { WorkflowTemplateRetrievalProjection } from "../../src/lib/types/workflow-template/workflow-template.type.js";

async function fixtureRow(name: string, embeddingService: EmbeddingService): Promise<WorkflowTemplateRetrievalProjection> {
  const { title, description, retrieval_summary, scope } = loadExpectedFixture(name);
  const text = renderForEmbedding(title, retrieval_summary);
  return {
    _id: path.basename(name, ".json"),
    title,
    description,
    current_version: 1,
    retrieval: {
      text,
      embedding: await embeddingService.embedDocument(text),
      aliases_lower: renderAliasesLower(retrieval_summary),
      retrieval_summary,
      institution_type: scope.institution_type,
      ...embeddingService.metadata(),
    },
  };
}

export async function buildFixtureRetrievalReader(embeddingService: EmbeddingService): Promise<IWorkflowTemplateRetrievalReader> {
  const rows = await Promise.all(expectedFixtureNames().map((name) => fixtureRow(name, embeddingService)));
  return {
    listForRetrieval: ({ institutionType }) =>
      Promise.resolve(institutionType ? rows.filter((row) => row.retrieval.institution_type === institutionType) : rows),
  };
}
