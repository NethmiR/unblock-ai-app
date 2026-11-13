import { BrandMark } from "@/components/ui/BrandMark";
import { ApproverDecisionPanel } from "./ApproverDecisionPanel";
import { ApproverHistory } from "./ApproverHistory";
import { ApproverPlanRail } from "./ApproverPlanRail";
import { ApproverTaskSummary } from "./ApproverTaskSummary";
import { APP_CONFIG } from "@/lib/config/app.config";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import type { ApproverViewDto } from "@/types/approval";

const COPY = TASK_REQUEST_COPY.approver;

export function ApproverHeader() {
  return (
    <header className="border-b border-line-admin bg-surface">
      <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-2.5 px-4 sm:px-6">
        <BrandMark />
        <span className="text-[14px] font-bold tracking-tight text-ink">{APP_CONFIG.name}</span>
        <span className="text-[13px] text-muted">· {COPY.pageLabel}</span>
      </div>
    </header>
  );
}

export function ApproverView({ token, view }: { token: string; view: ApproverViewDto }) {
  return (
    <>
      <ApproverHeader />
      <main className="mx-auto grid max-w-[1180px] gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:py-10">
        <div className="min-w-0 space-y-4">
          <ApproverTaskSummary view={view} />
          <ApproverHistory history={view.history} />
          <ApproverDecisionPanel token={token} view={view} />
        </div>
        <aside className="lg:border-l lg:border-line-admin lg:pl-6">
          <div className="lg:sticky lg:top-6">
            <ApproverPlanRail plan={view.plan} />
          </div>
        </aside>
      </main>
    </>
  );
}
