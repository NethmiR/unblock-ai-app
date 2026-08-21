"use client";
import { useMemo } from "react";
import { PlanNode } from "./PlanNode";
import { toPlanNodes } from "@/lib/workflow/toPlanNodes";
import { applyTaskProgress } from "@/lib/workflow/applyTaskProgress";
import type { TaskDto, TaskStatus } from "@/types/task";
import type { Workflow } from "@/types/workflow";

/** Header copy per status - the plan means something different once a task ends. */
const SUMMARY: Record<TaskStatus, string> = {
  collecting: "Waiting on your details",
  ready: "Ready to send",
  in_progress: "In progress",
  completed: "All steps complete",
  rejected: "Stopped — rejected",
  cancelled: "Stopped — cancelled",
};

/**
 * The requester's plan for a task that already exists.
 *
 * Read-only by design: PlanPanel is the composer's version and owns the submit
 * action, which has no meaning for a task already in flight. Sharing PlanNode
 * between them keeps the two views looking identical, which matters - the
 * requester should recognise the plan they approved at submission time.
 */
export function TaskPlanPanel({ task, workflow }: { task: TaskDto; workflow: Workflow }) {
  const nodes = useMemo(
    () => applyTaskProgress(toPlanNodes(workflow), task),
    [workflow, task],
  );

  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface">
      <header className="flex items-center justify-between gap-4 border-b border-line px-7 py-5">
        <div className="text-[15px] font-semibold tracking-tight">Workflow plan</div>
        <div className="text-[13px] text-muted">
          {nodes.length} steps · {SUMMARY[task.status]}
        </div>
      </header>

      <div className="px-7 pb-9 pt-7">
        <div className="mx-auto flex max-w-[560px] flex-col">
          {nodes.map((node, i) => (
            <PlanNode key={node.id} node={node} isLast={i === nodes.length - 1} />
          ))}
        </div>
      </div>
    </section>
  );
}
