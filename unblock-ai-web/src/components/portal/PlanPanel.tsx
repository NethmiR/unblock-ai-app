"use client";
import { useMemo } from "react";
import { PlanNode } from "./PlanNode";
import { Button } from "@/components/ui/Button";
import { toPlanNodes } from "@/lib/workflow/toPlanNodes";
import type { Workflow } from "@/types/workflow";

export function PlanPanel({ workflow, onSubmit }: { workflow: Workflow | null; onSubmit: () => void }) {
  const nodes = useMemo(() => (workflow ? toPlanNodes(workflow) : []), [workflow]);

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-sm">
      <header className="flex flex-none items-center justify-between gap-4 border-b border-line px-7 py-5">
        <div className="text-[15px] font-semibold tracking-tight">Workflow plan</div>
        <div className="text-[13px] text-muted">
          {workflow ? `${nodes.length} steps · not yet submitted` : "Waiting for your request"}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-10 pt-8">
        {!workflow ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-[22px] h-12 w-12 rounded-card border border-dashed border-slate-300" />
            <div className="text-base font-semibold">No plan yet</div>
            <p className="mt-2.5 max-w-[38ch] text-[14.5px] leading-relaxed text-muted">
              Once you describe your request, every approval step will be mapped out here before
              anything is sent to anyone.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[560px] flex-col">
            {nodes.map((node, i) => (
              <PlanNode key={node.id} node={node} isLast={i === nodes.length - 1} />
            ))}

            <div className="mt-8 flex items-center justify-between gap-5 border-t border-line pt-6">
              <div className="max-w-[34ch] text-[13.5px] leading-normal text-muted">
                Nothing is sent to any approver until you submit.
              </div>
              <Button onClick={onSubmit} className="h-[48px] flex-none rounded-card px-[22px] text-[15px] font-medium">
                Submit request
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
