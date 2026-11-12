import type { RetrievalCandidate } from "../../lib/types/selection/candidate.type.js";
import type { WorkflowTemplateRetrievalProjection } from "../../lib/types/workflow-template/workflow-template.type.js";

export function toRetrievalCandidate(row: WorkflowTemplateRetrievalProjection, score: number): RetrievalCandidate {
  return {
    workflow_template_id: row._id,
    workflow_template_version: row.current_version,
    title: row.title,
    description: row.description ?? "",
    score,
    aliases_lower: row.retrieval.aliases_lower,
    retrieval_summary: row.retrieval.retrieval_summary,
    retrieval_text: row.retrieval.text,
  };
}
