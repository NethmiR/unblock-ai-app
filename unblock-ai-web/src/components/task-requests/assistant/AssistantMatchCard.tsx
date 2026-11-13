"use client";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/icons/Icon";
import { AssistantWorkflowOverview } from "./AssistantWorkflowOverview";
import { requesterFactMessage } from "@/lib/task-request/requester-fact-message";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { IconName } from "@/types/icon";
import type { SelectionMatchDto } from "@/types/selection";

const COPY = TASK_REQUEST_COPY.assistant.match;

interface AssistantMatchCardProps {
  match: SelectionMatchDto;
  isStarting: boolean;
  startDisabled: boolean;
  error: string | null;
  onStart: () => void;
}

export function AssistantMatchCard({ match, isStarting, startDisabled, error, onStart }: AssistantMatchCardProps) {
  const overviewId = useId();
  const [showOverview, setShowOverview] = useState(false);

  return (
    <Card className="px-5 py-4">
      <p className="text-[14px] leading-relaxed text-ink">
        {COPY.lead} <strong className="font-semibold">{match.overview.title}</strong>.
      </p>

      {match.matched_facts.length > 0 && (
        <div className="mt-3">
          <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-[.07em] text-muted">{COPY.profileUsed}</h4>
          <ul className="space-y-1">
            {match.matched_facts.map((fact) => (
              <li key={fact.id} className="flex items-start gap-2 text-[13px] text-muted">
                <Icon name={IconName.CHECK} className="mt-0.5 h-3.5 w-3.5 text-success" />
                {requesterFactMessage(fact)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" leadingIcon={IconName.ARROW_UP_RIGHT} onClick={onStart} disabled={isStarting || startDisabled}>
          {isStarting ? COPY.starting : COPY.start}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={IconName.LIGHTBULB}
          aria-expanded={showOverview}
          aria-controls={overviewId}
          onClick={() => setShowOverview((open) => !open)}
        >
          {showOverview ? COPY.showLess : COPY.tellMeMore}
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[12.5px] text-danger">
          {error}
        </p>
      )}

      {showOverview && (
        <div id={overviewId} className="mt-4 border-t border-line-admin pt-4">
          <AssistantWorkflowOverview overview={match.overview} />
        </div>
      )}
    </Card>
  );
}
