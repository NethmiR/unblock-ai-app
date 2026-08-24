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
 * This is the ONLY place a real plan is drawn. The new-request page confirms a
 * process and saves the job rather than compiling a preview of its own, so the
 * first plan the requester ever sees is this one, built from the stored task -
 * customized to them, and accurate about what has actually happened.
 */
export function TaskPlanPanel({
  task,
  workflow,
  onNodeAction,
}: {
  task: TaskDto;
  workflow: Workflow;
  /**
   * Runs a node's `action` - in practice the one on `__inputs`, which opens
   * requirement collection. Keyed by node id rather than hardcoded here so the
   * panel stays a renderer: `applyTaskProgress` decides which node offers an
   * action, and the page decides what that action does.
   */
  onNodeAction?: (nodeId: string) => void;
}) {
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
            <PlanNode
              key={node.id}
              node={node}
              isLast={i === nodes.length - 1}
              onAction={onNodeAction ? () => onNodeAction(node.id) : undefined}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
