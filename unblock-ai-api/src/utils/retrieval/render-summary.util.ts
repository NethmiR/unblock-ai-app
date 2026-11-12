import type { RetrievalSummary } from "../../lib/types/workflow/retrieval-summary.type.js";

function labelledLine(label: string, values: readonly string[]): string | null {
  return values.length === 0 ? null : `${label}: ${values.join(", ")}`;
}

export function renderForEmbedding(title: string, summary: RetrievalSummary): string {
  return [
    title,
    summary.one_liner,
    labelledLine("Also known as", summary.aliases),
    labelledLine("Applies to", summary.requester_types),
    labelledLine("Use when", summary.triggers),
    labelledLine("Keywords", summary.keywords),
    labelledLine("Not for", summary.not_for),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function renderAliasesLower(summary: RetrievalSummary): string[] {
  return [...new Set(summary.aliases.map((alias) => alias.trim().toLowerCase()).filter(Boolean))];
}
