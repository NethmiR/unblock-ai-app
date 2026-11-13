import { ApproverDecisionPanel, type ApproverDecisionHandlers } from "./ApproverDecisionPanel";
import { ApproverHistory } from "./ApproverHistory";
import { ApproverPlanRail } from "./ApproverPlanRail";
import { ApproverTaskSummary } from "./ApproverTaskSummary";
import { cn } from "@/lib/utils/cn";
import type { ReactNode } from "react";
import type { ApproverViewDto } from "@/types/approval";

interface ApproverDetailLayoutProps extends ApproverDecisionHandlers {
  view: ApproverViewDto;
  footer?: ReactNode;
  className?: string;
}

export function ApproverDetailLayout({ view, onDecide, onDecided, footer, className }: ApproverDetailLayoutProps) {
  return (
    <div className={cn("grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]", className)}>
      <div className="min-w-0 space-y-4">
        <ApproverTaskSummary view={view} />
        <ApproverHistory history={view.history} />
        <ApproverDecisionPanel view={view} onDecide={onDecide} onDecided={onDecided} />
        {footer}
      </div>
      <aside className="lg:border-l lg:border-line-admin lg:pl-6">
        <div className="lg:sticky lg:top-6">
          <ApproverPlanRail plan={view.plan} />
        </div>
      </aside>
    </div>
  );
}
