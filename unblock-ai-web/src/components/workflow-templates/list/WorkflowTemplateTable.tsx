"use client";
import Link from "next/link";
import { DateTime } from "@/components/ui/DateTime";
import { Menu } from "@/components/ui/Menu";
import { Table, TableCell, TableHeader, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { WorkflowTemplateStatusBadges } from "@/components/workflow-templates/shared/WorkflowTemplateStatusBadges";
import { workflowTemplateDetailPath } from "@/lib/routing/route-path";
import { WORKFLOW_TEMPLATE_COPY } from "@/lib/workflow-template/workflow-template-copy";
import { cn } from "@/lib/utils/cn";
import type { MenuItem } from "@/types/menu";
import type { WorkflowTemplateSummaryDto } from "@/types/workflow-template";

const COPY = WORKFLOW_TEMPLATE_COPY.list;
const COLUMNS = "minmax(0,2.2fr) minmax(0,1.1fr) 5rem minmax(0,1.2fr) 2.5rem";

interface WorkflowTemplateTableProps {
  templates: readonly WorkflowTemplateSummaryDto[];
  actionsFor: (template: WorkflowTemplateSummaryDto) => MenuItem[];
}

export function WorkflowTemplateTable({ templates, actionsFor }: WorkflowTemplateTableProps) {
  return (
    <Table columns={COLUMNS} label={COPY.tableLabel}>
      <TableHeader>
        <TableHeaderCell>{COPY.columns.template}</TableHeaderCell>
        <TableHeaderCell>{COPY.columns.status}</TableHeaderCell>
        <TableHeaderCell>{COPY.columns.version}</TableHeaderCell>
        <TableHeaderCell>{COPY.columns.updated}</TableHeaderCell>
        <TableHeaderCell />
      </TableHeader>

      {templates.map((template) => (
        <TableRow key={template.id} muted={template.is_archived} className="relative hover:bg-bg">
          <TableCell>
            <Link
              href={workflowTemplateDetailPath(template.id)}
              aria-label={COPY.openTemplate(template.title)}
              className={cn(
                "block truncate font-semibold after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-accent/40",
                template.is_archived ? "text-muted" : "text-ink",
              )}
            >
              {template.title}
            </Link>
            <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-relaxed text-muted">
              {template.description ?? COPY.noDescription}
            </span>
          </TableCell>
          <TableCell>
            <WorkflowTemplateStatusBadges template={template} />
          </TableCell>
          <TableCell className="font-mono text-[12.5px] text-muted">
            {template.current_version === null
              ? WORKFLOW_TEMPLATE_COPY.status.noVersion
              : WORKFLOW_TEMPLATE_COPY.status.version(template.current_version)}
          </TableCell>
          <TableCell className="text-[12.5px] text-muted">
            <DateTime iso={template.updated_at} className="block" />
            {template.updated_by && <span className="block truncate">{COPY.updatedBy(template.updated_by.full_name)}</span>}
          </TableCell>
          <TableCell className="relative z-10 flex justify-end">
            <Menu items={actionsFor(template)} />
          </TableCell>
        </TableRow>
      ))}
    </Table>
  );
}
