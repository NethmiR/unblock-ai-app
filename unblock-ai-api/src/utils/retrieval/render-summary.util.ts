import type { WorkflowDefinition } from "../../lib/types/workflow/workflow.type.js";
import { ValidationError } from "../../errors/validation.error.js";

function labelledLine(label: string, values: string[] | undefined): string | null {
  if (!Array.isArray(values) || values.length === 0) return null;
  return `${label}: ${values.join(", ")}`;
}

export function renderForEmbedding(workflow: WorkflowDefinition): string {
  const s = workflow?.retrieval_summary;
  if (!s) {
    throw new ValidationError(
      `Workflow '${workflow?.workflow_id ?? "<unknown>"}' has no retrieval_summary; ` +
        `it cannot be embedded. Run scripts/backfillSummaries.js first.`,
    );
  }

  return [
    workflow.title,
    s.one_liner,
    labelledLine("Also known as", s.aliases),
    labelledLine("Applies to", s.requester_types),
    labelledLine("Use when", s.triggers),
    labelledLine("Keywords", s.keywords),
    labelledLine("Not for", s.not_for),
  ]
    .filter(Boolean)
    .join("\n");
}

export function renderAliasesLower(workflow: WorkflowDefinition): string[] {
  const aliases = workflow?.retrieval_summary?.aliases ?? [];
  return [...new Set(aliases.map((a) => a.trim().toLowerCase()).filter(Boolean))];
}
