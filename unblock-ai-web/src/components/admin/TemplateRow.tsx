import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { relativeTime } from "@/lib/utils/format";
import type { WorkflowSummary } from "@/types/workflow";

/**
 * One row of the template list.
 *
 * The grid template comes straight from the mockup: 1fr for the title/description
 * block, then fixed columns for owner, timestamp, and the chevron.
 *
 * The delete control is a SIBLING of the link, not a child: a button nested in
 * an anchor is invalid HTML and gets the click semantics wrong. The link is
 * stretched over the row with an inset overlay instead, so the whole row still
 * navigates while the button keeps its own hit area.
 */
export function TemplateRow({
  template,
  onDelete,
}: {
  template: WorkflowSummary;
  onDelete: (template: WorkflowSummary) => void;
}) {
  const isDraft = template.review_status !== "confirmed";

  return (
    <div className="group relative grid grid-cols-[1fr_190px_96px_28px_36px] items-center gap-5 border-t border-line-admin/70 px-[22px] py-[18px] transition-colors first:border-t-0 hover:bg-bg">
      <Link
        href={`/admin/templates/${template.workflow_id}`}
        className="absolute inset-0 z-0"
        aria-label={`Open ${template.title}`}
      />

      <div className="pointer-events-none relative min-w-0">
        <div className="mb-[5px] flex items-center gap-2.5">
          <span className="text-[15px] font-semibold tracking-tight">{template.title}</span>
          {isDraft && <Badge tone="warn">Draft</Badge>}
        </div>
        <div className="text-[13px] leading-normal text-muted">{template.description}</div>
      </div>

      {/* `owner` is not modelled on the backend yet - derive a stand-in from
          the workflow's scope rather than inventing a column. */}
      <div className="pointer-events-none relative text-xs text-muted">—</div>
      <div className="pointer-events-none relative text-right text-xs text-muted">
        {relativeTime(template.updated_at)}
      </div>
      <div className="pointer-events-none relative text-right text-sm text-muted">→</div>

      <button
        type="button"
        onClick={() => onDelete(template)}
        aria-label={`Delete ${template.title}`}
        title="Delete template"
        className="relative z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-control text-muted transition-colors hover:bg-danger/10 hover:text-danger focus-visible:bg-danger/10 focus-visible:text-danger focus-visible:outline-none"
      >
        <TrashIcon />
      </button>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 4h11M6.5 4V2.75A.75.75 0 0 1 7.25 2h1.5a.75.75 0 0 1 .75.75V4M12.5 4l-.6 8.4a1 1 0 0 1-1 .93H5.1a1 1 0 0 1-1-.93L3.5 4M6.6 6.8v4M9.4 6.8v4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
