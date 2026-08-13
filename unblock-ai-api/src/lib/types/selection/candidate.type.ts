import type { RetrievalSummary } from "../workflow/retrieval-summary.type.js";

export interface RetrievalCandidate {
  workflow_id: string;
  version: number;
  title: string;
  description: string;
  score: number;
  aliases_lower: string[];
  retrieval_summary: RetrievalSummary | null;
  retrieval_text: string;
}

export interface BoostedCandidate extends RetrievalCandidate {
  base_score: number;
  alias_hits: string[];
}
