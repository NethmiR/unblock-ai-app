"use client";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { CodeChip } from "@/components/ui/CodeChip";
import { DateTime } from "@/components/ui/DateTime";
import { Table, TableCell, TableHeader, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { ApprovalDecisionBadge, TaskStatusBadge } from "@/components/task-requests/shared/TaskStatusBadges";
import { decidedViaCaption, historyOutcomeText, waitingSince } from "@/lib/approvals/approval-assignment-presentation";
import { approvalDetailPath } from "@/lib/routing/route-path";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { ApprovalAssignmentState, type ApprovalAssignmentDto } from "@/types/approval";
import type { ReactNode } from "react";

const COPY = TASK_REQUEST_COPY.approvals;
const COLUMN_COPY = COPY.columns;

interface ApprovalColumn {
  header: string;
  render: (row: ApprovalAssignmentDto) => ReactNode;
}

interface ApprovalTableMode {
  label: string;
  template: string;
  columns: readonly ApprovalColumn[];
}

function RequestCell({ row }: { row: ApprovalAssignmentDto }) {
  return (
    <>
      <Link
        href={approvalDetailPath(row.task_id, row.step_id)}
        aria-label={COPY.openApproval(row.title)}
        className="block truncate font-semibold text-ink after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-accent/40"
      >
        {row.title}
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <CodeChip code={row.reference} />
        {row.is_repeat && <Badge tone="accent">{COPY.repeatReview}</Badge>}
      </div>
    </>
  );
}

function RequesterCell({ row }: { row: ApprovalAssignmentDto }) {
  const unit = row.requester.unit_names[0];
  return (
    <>
      <p className="truncate text-ink">{row.requester.full_name}</p>
      {unit && <p className="truncate text-[12.5px] text-muted">{unit}</p>}
    </>
  );
}

function WaitingSinceCell({ row }: { row: ApprovalAssignmentDto }) {
  const since = waitingSince(row);
  return (
    <>
      <p className="text-[12.5px] text-ink">
        <DateTime iso={since.iso} />
      </p>
      <p className="text-[12px] text-muted">{since.relative}</p>
    </>
  );
}

function DecisionCell({ row }: { row: ApprovalAssignmentDto }) {
  return (
    <>
      {row.decision && <ApprovalDecisionBadge decision={row.decision} />}
      <p className="mt-1 truncate text-[12.5px] text-muted">{row.comment ?? COPY.noComment}</p>
    </>
  );
}

function OutcomeCell({ row }: { row: ApprovalAssignmentDto }) {
  return (
    <>
      <TaskStatusBadge status={row.task_status} />
      <p className="mt-1 text-[12.5px] text-muted">{historyOutcomeText(row)}</p>
    </>
  );
}

function DecidedCell({ row }: { row: ApprovalAssignmentDto }) {
  const caption = decidedViaCaption(row.decided_via);
  return (
    <>
      {row.decided_at && (
        <p className="text-[12.5px] text-ink">
          <DateTime iso={row.decided_at} />
        </p>
      )}
      {caption && <p className="text-[12px] text-muted">{caption}</p>}
    </>
  );
}

const REQUEST_COLUMN: ApprovalColumn = { header: COLUMN_COPY.request, render: (row) => <RequestCell row={row} /> };
const REQUESTER_COLUMN: ApprovalColumn = { header: COLUMN_COPY.requester, render: (row) => <RequesterCell row={row} /> };

const TABLE_MODES: Record<ApprovalAssignmentState, ApprovalTableMode> = {
  [ApprovalAssignmentState.PENDING]: {
    label: COPY.inbox.tableLabel,
    template: "minmax(0,2.2fr) minmax(0,1.4fr) minmax(0,1.4fr) minmax(0,1.1fr)",
    columns: [
      REQUEST_COLUMN,
      REQUESTER_COLUMN,
      { header: COLUMN_COPY.yourStep, render: (row) => <span className="text-[13px] text-ink">{row.step_name}</span> },
      { header: COLUMN_COPY.waitingSince, render: (row) => <WaitingSinceCell row={row} /> },
    ],
  },
  [ApprovalAssignmentState.DECIDED]: {
    label: COPY.history.tableLabel,
    template: "minmax(0,2fr) minmax(0,1.2fr) minmax(0,1.5fr) minmax(0,1.6fr) minmax(0,1.1fr)",
    columns: [
      REQUEST_COLUMN,
      REQUESTER_COLUMN,
      { header: COLUMN_COPY.yourDecision, render: (row) => <DecisionCell row={row} /> },
      { header: COLUMN_COPY.outcome, render: (row) => <OutcomeCell row={row} /> },
      { header: COLUMN_COPY.decided, render: (row) => <DecidedCell row={row} /> },
    ],
  },
};

interface ApprovalAssignmentTableProps {
  mode: ApprovalAssignmentState;
  rows: readonly ApprovalAssignmentDto[];
}

export function ApprovalAssignmentTable({ mode, rows }: ApprovalAssignmentTableProps) {
  const { label, template, columns } = TABLE_MODES[mode];
  return (
    <Table columns={template} label={label}>
      <TableHeader>
        {columns.map((column) => (
          <TableHeaderCell key={column.header}>{column.header}</TableHeaderCell>
        ))}
      </TableHeader>

      {rows.map((row) => (
        <TableRow key={`${row.task_id}:${row.step_id}`} className="relative hover:bg-bg">
          {columns.map((column) => (
            <TableCell key={column.header}>{column.render(row)}</TableCell>
          ))}
        </TableRow>
      ))}
    </Table>
  );
}
