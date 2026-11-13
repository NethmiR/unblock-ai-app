"use client";
import { AssistantManualChoice } from "./AssistantManualChoice";
import { AssistantMark } from "./AssistantMark";
import { AssistantMatchCard } from "./AssistantMatchCard";
import { AssistantNoMatch } from "./AssistantNoMatch";
import { AssistantQuestion } from "./AssistantQuestion";
import { AssistantStartingTask } from "./AssistantStartingTask";
import { AssistantThinkingTrace } from "./AssistantThinkingTrace";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { SelectionDecisionKind, type AssistantSelectionMessageDto } from "@/types/selection";

export interface AssistantMessageActions {
  isSending: boolean;
  startingKey: string | null;
  startError: { key: string; message: string } | null;
  onStart: (messageId: string) => void;
  onPickOption: (label: string) => void;
  onChoose: (workflowTemplateId: string) => void;
  onBrowse: () => void;
  onStartOver: () => void;
}

interface AssistantMessageProps {
  message: AssistantSelectionMessageDto;
  isNewest: boolean;
  actions: AssistantMessageActions;
}

function AssistantMessageBody({ message, isNewest, actions }: AssistantMessageProps) {
  const isStarting = actions.startingKey === message.id;
  const startError = actions.startError?.key === message.id ? actions.startError.message : null;
  const startDisabled = actions.startingKey !== null || actions.isSending;
  const interactionDisabled = !isNewest || actions.isSending || actions.startingKey !== null;

  switch (message.decision) {
    case SelectionDecisionKind.MATCHED:
      return message.match ? (
        <AssistantMatchCard
          match={message.match}
          isStarting={isStarting}
          startDisabled={startDisabled}
          error={startError}
          onStart={() => actions.onStart(message.id)}
        />
      ) : (
        <AssistantNoMatch trace={message.trace} showActions={isNewest} onBrowse={actions.onBrowse} onStartOver={actions.onStartOver} />
      );
    case SelectionDecisionKind.START_REQUESTED:
      return message.match ? (
        <AssistantStartingTask
          title={message.match.overview.title}
          isStarting={isStarting}
          error={startError}
          onStart={() => actions.onStart(message.id)}
        />
      ) : null;
    case SelectionDecisionKind.AMBIGUOUS:
      return <AssistantQuestion question={message.question} options={message.options} disabled={interactionDisabled} onPick={actions.onPickOption} />;
    case SelectionDecisionKind.MANUAL_CHOICE:
      return <AssistantManualChoice options={message.options} disabled={interactionDisabled} onChoose={actions.onChoose} />;
    case SelectionDecisionKind.NO_MATCH:
      return <AssistantNoMatch trace={message.trace} showActions={isNewest} onBrowse={actions.onBrowse} onStartOver={actions.onStartOver} />;
    default: {
      const unreachable: never = message.decision;
      return unreachable;
    }
  }
}

export function AssistantMessage(props: AssistantMessageProps) {
  return (
    <div className="flex items-start gap-3">
      <AssistantMark className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="sr-only">{TASK_REQUEST_COPY.assistant.unblock}</p>
        <AssistantThinkingTrace trace={props.message.trace} defaultExpanded={props.isNewest} />
        <AssistantMessageBody {...props} />
      </div>
    </div>
  );
}
