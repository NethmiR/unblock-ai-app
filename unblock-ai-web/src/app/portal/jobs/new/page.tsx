"use client";
import { useRouter } from "next/navigation";
import { useSelectionSession } from "@/lib/hooks/useSelectionSession";
import { SelectionChat } from "@/components/portal/SelectionChat";
import { PlanPanel } from "@/components/portal/PlanPanel";
import Link from "next/link";

export default function NewJobPage() {
  const router = useRouter();
  const { messages, decision, workflow, isBusy, send, choose, hasStarted } = useSelectionSession();

  return (
    <div className="mx-auto flex h-screen max-w-[1440px] flex-col px-16 pb-7 pt-9">
      <div className="mb-6 flex flex-none items-start justify-between gap-8">
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-[.14em] text-muted">New job</div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {workflow ? workflow.title : "Create a new job"}
          </h1>
        </div>
        <Link href="/portal" className="flex flex-none items-center gap-2.5 px-1 py-2.5 text-[14.5px] font-medium">
          <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden>
            <path d="M11 3.5L5.5 9l5.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          See other jobs
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 gap-[22px]">
        <SelectionChat
          messages={messages}
          decision={decision}
          isBusy={isBusy}
          hasStarted={hasStarted}
          onSend={send}
          onChoose={choose}
        />
        <PlanPanel workflow={workflow} onSubmit={() => router.push("/portal")} />
      </div>
    </div>
  );
}
