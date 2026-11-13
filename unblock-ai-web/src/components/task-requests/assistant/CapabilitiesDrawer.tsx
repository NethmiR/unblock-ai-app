"use client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Icon } from "@/components/ui/icons/Icon";
import { SearchInput } from "@/components/ui/SearchInput";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { AssistantWorkflowOverview } from "./AssistantWorkflowOverview";
import { useSelectionCatalogue } from "@/lib/hooks/useSelectionCatalogue";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { cn } from "@/lib/utils/cn";
import { IconName } from "@/types/icon";
import type { WorkflowOverviewDto } from "@/types/selection";

const COPY = TASK_REQUEST_COPY.capabilities;

interface CapabilitiesDrawerProps {
  startingKey: string | null;
  startError: { key: string; message: string } | null;
  onStart: (workflowTemplateId: string) => void;
  onClose: () => void;
}

function matchesSearch(template: WorkflowOverviewDto, term: string): boolean {
  return term === "" || [template.title, template.one_liner, template.description].some((text) => text.toLowerCase().includes(term));
}

export function CapabilitiesDrawer({ startingKey, startError, onStart, onClose }: CapabilitiesDrawerProps) {
  const { data, error, isLoading, mutate } = useSelectionCatalogue();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const templates = useMemo(() => data?.workflow_templates ?? [], [data]);
  const visible = useMemo(() => templates.filter((template) => matchesSearch(template, search.trim().toLowerCase())), [templates, search]);

  function renderBody() {
    if (data === undefined && isLoading) return <SkeletonRows count={4} label={COPY.loading} />;
    if (data === undefined && error !== undefined) return <InlineAlert onRetry={() => void mutate()}>{COPY.loadFailed}</InlineAlert>;
    if (templates.length === 0) {
      return (
        <div className="py-10 text-center">
          <p className="text-[15px] font-semibold text-ink">{COPY.emptyTitle}</p>
          <p className="mt-1 text-[13px] text-muted">{COPY.emptyBody}</p>
        </div>
      );
    }
    if (visible.length === 0) return <p className="py-6 text-center text-[13px] text-muted">{COPY.noMatches}</p>;
    return (
      <ul className="space-y-2">
        {visible.map((template) => {
          const isExpanded = expandedId === template.workflow_template_id;
          const panelId = `capability-${template.workflow_template_id}`;
          const isStarting = startingKey === template.workflow_template_id;
          return (
            <li key={template.workflow_template_id} className="rounded-card border border-line-admin">
              <button
                type="button"
                aria-expanded={isExpanded}
                aria-controls={panelId}
                aria-label={COPY.expand(template.title)}
                onClick={() => setExpandedId(isExpanded ? null : template.workflow_template_id)}
                className="flex w-full cursor-pointer items-start justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40"
              >
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold text-ink">{template.title}</span>
                  {template.one_liner && <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted">{template.one_liner}</span>}
                </span>
                <Icon name={IconName.CHEVRON_DOWN} className={cn("mt-0.5 h-4 w-4 text-muted transition-transform", isExpanded && "rotate-180")} />
              </button>
              {isExpanded && (
                <div id={panelId} className="space-y-4 border-t border-line-admin px-4 py-4">
                  <AssistantWorkflowOverview overview={template} />
                  {startError?.key === template.workflow_template_id && (
                    <p role="alert" className="text-[12.5px] text-danger">
                      {startError.message}
                    </p>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    leadingIcon={IconName.ARROW_UP_RIGHT}
                    disabled={startingKey !== null}
                    onClick={() => onStart(template.workflow_template_id)}
                  >
                    {isStarting ? TASK_REQUEST_COPY.assistant.match.starting : TASK_REQUEST_COPY.assistant.match.start}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Drawer title={COPY.title} description={COPY.description} busy={startingKey !== null} onClose={onClose}>
      <SearchInput
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={COPY.searchPlaceholder}
        aria-label={COPY.searchPlaceholder}
        className="mb-4"
      />
      {renderBody()}
    </Drawer>
  );
}
