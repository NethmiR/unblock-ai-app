import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/utils/format";
import type { ApproverStatus, ApproverViewDto } from "@/types/approval";

const STATUS_TONE: Record<ApproverStatus, "success" | "danger" | "warn" | "neutral"> = {
  approved: "success",
  rejected: "danger",
  request_more_info: "warn",
  awaiting: "neutral",
  not_yet_reached: "neutral",
};

const STATUS_LABEL: Record<ApproverStatus, string> = {
  approved: "Approved",
  rejected: "Rejected",
  request_more_info: "More info requested",
  awaiting: "Pending",
  not_yet_reached: "Pending",
};

export function ApproverList({ approvers }: { approvers: ApproverViewDto["approvers"] }) {
  return (
    <Card className="mb-6 px-7 py-6">
      <div className="mb-4 text-[13px] font-semibold uppercase tracking-[.08em] text-muted">
        Approvers
      </div>
      <div className="flex flex-col gap-3">
        {approvers.map((a) => (
          <div key={a.step_id} className="flex items-start justify-between gap-4 text-[13.5px]">
            <div>
              <span className="font-medium text-ink">
                {a.designation}
                {a.is_current && <span className="text-muted"> (you)</span>}
              </span>
              <p className="mt-0.5 text-[13px] text-muted">
                {a.name ? `${a.name}${a.email ? ` (${a.email})` : ""}` : "Not yet provided"}
              </p>
            </div>
            <div className="flex flex-none flex-col items-end gap-1">
              <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
              {a.decided_at && (
                <span className="text-[12.5px] text-faint">{formatDateTime(a.decided_at)}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
