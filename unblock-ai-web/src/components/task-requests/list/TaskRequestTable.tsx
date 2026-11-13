"use client";
import Link from "next/link";
import { CodeChip } from "@/components/ui/CodeChip";
import { DateTime } from "@/components/ui/DateTime";
import { Menu } from "@/components/ui/Menu";
import { Table, TableCell, TableHeader, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { TaskStatusBadge, TaskStepStatusBadge } from "@/components/task-requests/shared/TaskStatusBadges";
import { taskDetailPath } from "@/lib/routing/route-path";
import { progressRatio } from "@/lib/task-request/task-progress";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import type { MenuItem } from "@/types/menu";
import type { TaskSummaryDto } from "@/types/task";

const COPY = TASK_REQUEST_COPY.list;
const COLUMNS = "minmax(0,2.2fr) minmax(0,1fr) minmax(0,1.6fr) minmax(0,1fr) minmax(0,1.1fr) 2.5rem";

interface TaskRequestTableProps {
  tasks: readonly TaskSummaryDto[];
  actionsFor: (task: TaskSummaryDto) => MenuItem[];
}

function ProgressCell({ task }: { task: TaskSummaryDto }) {
  const { completed, total } = task.progress;
  return (
    <div>
      <span className="text-[12.5px] text-muted">{COPY.progress(completed, total)}</span>
      <div
        role="progressbar"
        aria-label={COPY.progressLabel(completed, total)}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completed}
        className="mt-1 h-1.5 w-full max-w-[120px] overflow-hidden rounded-pill bg-bg"
      >
        <div className="h-full rounded-pill bg-accent" style={{ width: `${progressRatio(completed, total) * 100}%` }} />
      </div>
    </div>
  );
}

export function TaskRequestTable({ tasks, actionsFor }: TaskRequestTableProps) {
  return (
    <Table columns={COLUMNS} label={COPY.tableLabel}>
      <TableHeader>
        <TableHeaderCell>{COPY.columns.request}</TableHeaderCell>
        <TableHeaderCell>{COPY.columns.status}</TableHeaderCell>
        <TableHeaderCell>{COPY.columns.currentStep}</TableHeaderCell>
        <TableHeaderCell>{COPY.columns.progress}</TableHeaderCell>
        <TableHeaderCell>{COPY.columns.updated}</TableHeaderCell>
        <TableHeaderCell />
      </TableHeader>

      {tasks.map((task) => (
        <TableRow key={task.id} className="relative hover:bg-bg">
          <TableCell>
            <Link
              href={taskDetailPath(task.id)}
              aria-label={COPY.openRequest(task.title)}
              className="block truncate font-semibold text-ink after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-accent/40"
            >
              {task.title}
            </Link>
            <CodeChip code={task.reference} className="mt-1" />
          </TableCell>
          <TableCell>
            <TaskStatusBadge status={task.status} />
          </TableCell>
          <TableCell>
            {task.current_steps.length === 0 ? (
              <span className="text-muted">{COPY.noCurrentStep}</span>
            ) : (
              <ul className="space-y-1">
                {task.current_steps.map((step) => (
                  <li key={step.id} className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[13px] text-ink">{step.name}</span>
                    <TaskStepStatusBadge status={step.status} />
                  </li>
                ))}
              </ul>
            )}
          </TableCell>
          <TableCell>
            <ProgressCell task={task} />
          </TableCell>
          <TableCell className="text-[12.5px] text-muted">
            <DateTime iso={task.updated_at} />
          </TableCell>
          <TableCell className="relative z-10 flex justify-end">
            <Menu items={actionsFor(task)} label={TASK_REQUEST_COPY.actions.menuLabel} />
          </TableCell>
        </TableRow>
      ))}
    </Table>
  );
}
