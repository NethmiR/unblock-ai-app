"use client";
import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArchiveListToolbar } from "@/components/ui/ArchiveListToolbar";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { LifecycleDialog } from "@/components/organisation/shared/LifecycleDialog";
import { NoMatchingResults } from "@/components/organisation/shared/NoMatchingResults";
import { WorkflowTemplateTable } from "./WorkflowTemplateTable";
import { useArchiveListFilters } from "@/lib/hooks/useArchiveListFilters";
import { useWorkflowTemplates } from "@/lib/hooks/useWorkflowTemplateData";
import {
  toWorkflowTemplateLifecycleTarget,
  useWorkflowTemplateLifecycle,
  workflowTemplateLifecycleAction,
} from "@/lib/hooks/useWorkflowTemplateLifecycle";
import { matchesArchiveFilter } from "@/lib/organisation/archive-filter";
import { RoutePath, workflowTemplateDetailPath } from "@/lib/routing/route-path";
import { WORKFLOW_TEMPLATE_COPY } from "@/lib/workflow-template/workflow-template-copy";
import { IconName } from "@/types/icon";
import { LifecycleAction } from "@/lib/organisation/lifecycle-action";
import type { MenuItem } from "@/types/menu";
import type { WorkflowTemplateSummaryDto } from "@/types/workflow-template";

const COPY = WORKFLOW_TEMPLATE_COPY.list;
const ACTIONS = WORKFLOW_TEMPLATE_COPY.actions;

function matchesSearch(template: WorkflowTemplateSummaryDto, search: string): boolean {
  const term = search.trim().toLowerCase();
  return term === "" || [template.title, template.description ?? ""].some((text) => text.toLowerCase().includes(term));
}

export function WorkflowTemplatesScreen() {
  const router = useRouter();
  const { data, error, isLoading, mutate } = useWorkflowTemplates(true);
  const filters = useArchiveListFilters();
  const lifecycle = useWorkflowTemplateLifecycle();

  const templates = useMemo(() => data?.workflow_templates ?? [], [data]);
  const visible = useMemo(
    () =>
      templates.filter(
        (template) => matchesArchiveFilter(template, filters.archiveFilter) && matchesSearch(template, filters.debouncedSearch),
      ),
    [templates, filters.archiveFilter, filters.debouncedSearch],
  );

  const actionsFor = useCallback(
    (template: WorkflowTemplateSummaryDto): MenuItem[] => {
      const action = workflowTemplateLifecycleAction(template);
      return [
        { label: ACTIONS.open, icon: IconName.EDIT, onSelect: () => router.push(workflowTemplateDetailPath(template.id)) },
        {
          label: action === LifecycleAction.ARCHIVE ? ACTIONS.archive : ACTIONS.restore,
          icon: action === LifecycleAction.ARCHIVE ? IconName.ARCHIVE : IconName.RESTORE,
          onSelect: () => lifecycle.open(action, toWorkflowTemplateLifecycleTarget(template)),
        },
      ];
    },
    [lifecycle, router],
  );

  const newTemplateLink = (
    <ButtonLink href={RoutePath.WORKFLOWS_NEW} leadingIcon={IconName.PLUS}>
      {COPY.newTemplate}
    </ButtonLink>
  );

  return (
    <>
      <ArchiveListToolbar
        search={filters.search}
        onSearchChange={filters.setSearch}
        searchPlaceholder={COPY.searchPlaceholder}
        archiveFilter={filters.archiveFilter}
        onArchiveFilterChange={filters.setArchiveFilter}
        archiveFilterLabel={COPY.archiveFilterLabel}
        action={newTemplateLink}
      />

      <QueryState
        data={data}
        error={error}
        isLoading={isLoading}
        loadingLabel={COPY.loading}
        errorMessage={COPY.loadFailed}
        onRetry={() => void mutate()}
      >
        {() => {
          if (templates.length === 0) return <EmptyState title={COPY.emptyTitle} body={COPY.emptyBody} action={newTemplateLink} />;
          if (visible.length === 0) return <NoMatchingResults message={COPY.noMatches} />;
          return <WorkflowTemplateTable templates={visible} actionsFor={actionsFor} />;
        }}
      </QueryState>

      <LifecycleDialog state={lifecycle} />
    </>
  );
}
