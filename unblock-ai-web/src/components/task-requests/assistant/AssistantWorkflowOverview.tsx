import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/icons/Icon";
import { overviewAssigneeLabel } from "@/lib/task-request/assignee-presentation";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { TASK_STEP_KIND_PRESENTATION } from "@/lib/task-request/task-status-presentation";
import type { WorkflowOverviewDto } from "@/types/selection";

const COPY = TASK_REQUEST_COPY.overview;
const HEADING = "mb-2 text-[11px] font-bold uppercase tracking-[.07em] text-muted";

export function AssistantWorkflowOverview({ overview }: { overview: WorkflowOverviewDto }) {
  const information = overview.requires_approver_details ? [...overview.information_needed, COPY.approverDetails] : overview.information_needed;

  return (
    <div className="space-y-4">
      {overview.one_liner && <p className="text-[13.5px] leading-relaxed text-ink">{overview.one_liner}</p>}

      <section>
        <h4 className={HEADING}>{COPY.stepsHeading}</h4>
        <ol className="space-y-2">
          {overview.steps.map((step, index) => (
            <li key={step.id} className="flex items-start gap-3">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-line-admin text-[11.5px] font-semibold text-muted">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Icon name={TASK_STEP_KIND_PRESENTATION[step.kind].icon} className="h-4 w-4 text-muted" />
                  <span className="text-[13.5px] font-semibold text-ink">{step.name}</span>
                  {step.is_conditional && <Badge>{COPY.onlyWhenNeeded}</Badge>}
                </div>
                {step.assignee && <p className="mt-0.5 text-[12.5px] text-muted">{overviewAssigneeLabel(step.assignee)}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h4 className={HEADING}>{COPY.informationHeading}</h4>
        {information.length === 0 ? (
          <p className="text-[13px] text-muted">{COPY.noInformation}</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink">
            {information.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
