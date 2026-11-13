"use client";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/ui/BrandMark";
import { ApproverDetailLayout } from "./ApproverDetailLayout";
import { approvalsApi } from "@/lib/api/approvals";
import { APP_CONFIG } from "@/lib/config/app.config";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import type { ApprovalDecisionInputDto, ApproverViewDto } from "@/types/approval";

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
  const router = useRouter();
  return (
    <>
      <ApproverHeader />
      <main className="mx-auto max-w-[1180px] px-4 py-8 sm:px-6 lg:py-10">
        <ApproverDetailLayout
          view={view}
          onDecide={(input: ApprovalDecisionInputDto) => approvalsApi.decide(token, input)}
          onDecided={() => router.refresh()}
        />
      </main>
    </>
  );
}
