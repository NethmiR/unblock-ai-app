import { Card } from "@/components/ui/Card";
import { DateTime } from "@/components/ui/DateTime";
import { ApproverDefinitionList, ApproverSectionHeading } from "./ApproverSection";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import type { ApproverViewDto } from "@/types/approval";
import type { RequesterSnapshotDto } from "@/types/requester";

const COPY = TASK_REQUEST_COPY.approver;

function RequesterCard({ requester }: { requester: RequesterSnapshotDto }) {
  return (
    <Card className="px-5 py-4">
      <ApproverSectionHeading>{COPY.requesterHeading}</ApproverSectionHeading>
      <p className="text-[15px] font-semibold text-ink">{requester.full_name}</p>
      <p className="text-[12.5px] text-muted">{requester.email}</p>
      {requester.units.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {requester.units.map((unit) => (
            <li key={unit.code} className="text-[13px] text-ink">
              <span className="font-semibold">{unit.name}</span>
              {unit.parent_name && <span className="text-muted">, {unit.parent_name}</span>}
              {unit.designation_titles.length > 0 && <span className="block text-[12.5px] text-muted">{unit.designation_titles.join(", ")}</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function InformationExchanges({ exchanges }: { exchanges: ApproverViewDto["information_exchanges"] }) {
  return (
    <Card className="px-5 py-4">
      <ApproverSectionHeading>{COPY.informationHeading}</ApproverSectionHeading>
      <ol className="space-y-4">
        {exchanges.map((exchange, index) => (
          <li key={`${exchange.asked_at}-${index}`} className="space-y-2">
            <div>
              <p className="text-[12px] font-semibold text-muted">{COPY.askedBy(exchange.asked_by)}</p>
              <blockquote className="mt-1 whitespace-pre-wrap border-l-2 border-line-admin pl-3 text-[13.5px] text-ink">{exchange.question}</blockquote>
              <p className="mt-1 text-[12px] text-muted">
                {COPY.askedOn} <DateTime iso={exchange.asked_at} />
              </p>
            </div>
            {exchange.answer !== null ? (
              <div className="rounded-control bg-bg px-3 py-2">
                <p className="whitespace-pre-wrap text-[13.5px] text-ink">{exchange.answer}</p>
                {exchange.answered_at && (
                  <p className="mt-1 text-[12px] text-muted">
                    {COPY.answeredOn} <DateTime iso={exchange.answered_at} />
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[13px] text-muted">{COPY.notAnswered}</p>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function ApproverTaskSummary({ view }: { view: ApproverViewDto }) {
  return (
    <div className="space-y-4">
      <header>
        <p className="mb-1.5 font-mono text-xs font-medium uppercase tracking-[.14em] text-muted">{COPY.reference(view.task.reference)}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{view.task.title}</h1>
        <p className="mt-1.5 text-[13px] text-muted">
          {COPY.submittedOn} <DateTime iso={view.task.submitted_at} />
        </p>
      </header>

      <RequesterCard requester={view.task.requester} />

      {view.sections.map((section, index) => (
        <Card key={`${section.title}-${index}`} className="px-5 py-4">
          <ApproverSectionHeading>{section.title}</ApproverSectionHeading>
          <ApproverDefinitionList items={section.fields} />
        </Card>
      ))}

      {view.computed.length > 0 && (
        <Card className="px-5 py-4">
          <ApproverSectionHeading>{COPY.computedHeading}</ApproverSectionHeading>
          <ApproverDefinitionList items={view.computed} />
        </Card>
      )}

      {view.information_exchanges.length > 0 && <InformationExchanges exchanges={view.information_exchanges} />}
    </div>
  );
}
