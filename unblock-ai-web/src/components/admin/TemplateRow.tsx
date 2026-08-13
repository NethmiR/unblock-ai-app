import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { relativeTime } from "@/lib/utils/format";
import type { WorkflowSummary } from "@/types/workflow";

/**
 * One row of the template list.
 *
 * The grid template comes straight from the mockup: 1fr for the title/description
 * block, then fixed columns for owner, timestamp, and the chevron.
 */
export function TemplateRow({ template }: { template: WorkflowSummary }) {
  const isDraft = template.review_status !== "confirmed";

  return (
    <Link
      href={`/admin/templates/${template.workflow_id}`}
      className="grid cursor-pointer grid-cols-[1fr_190px_96px_28px] items-center gap-5 border-t border-line-admin/70 px-[22px] py-[18px] transition-colors first:border-t-0 hover:bg-bg"
    >
      <div className="min-w-0">
        <div className="mb-[5px] flex items-center gap-2.5">
          <span className="text-[15px] font-semibold tracking-tight">{template.title}</span>
          {isDraft && <Badge tone="warn">Draft</Badge>}
        </div>
        <div className="text-[13px] leading-normal text-muted">{template.description}</div>
      </div>

      {/* `owner` is not modelled on the backend yet - derive a stand-in from
          the workflow's scope rather than inventing a column. */}
      <div className="text-xs text-muted">—</div>
      <div className="text-right text-xs text-muted">{relativeTime(template.updated_at)}</div>
      <div className="text-right text-sm text-muted">→</div>
    </Link>
  );
}
