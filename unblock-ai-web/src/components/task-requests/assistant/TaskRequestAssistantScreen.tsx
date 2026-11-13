"use client";
import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { AssistantComposer } from "./AssistantComposer";
import { AssistantConversation } from "./AssistantConversation";
import { AssistantWelcome } from "./AssistantWelcome";
import { CapabilitiesDrawer } from "./CapabilitiesDrawer";
import type { AssistantMessageActions } from "./AssistantMessage";
import { useSelectionConversation } from "@/lib/hooks/useSelectionConversation";
import { useStartTaskRequest } from "@/lib/hooks/useStartTaskRequest";
import { useUnsavedChangesGuard } from "@/lib/hooks/useUnsavedChangesGuard";
import { normaliseComposerMessage } from "@/lib/task-request/selection-conversation";
import { SELECTION_FIELD_LIMIT } from "@/lib/task-request/task-request-constant";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { UI_COPY } from "@/lib/constants/ui-copy";
import { SelectionDecisionKind, SelectionMessageRole } from "@/types/selection";
import { TaskCreationSource } from "@/types/task";

const COPY = TASK_REQUEST_COPY.assistant;

export function TaskRequestAssistantScreen() {
  const conversation = useSelectionConversation();
  const starter = useStartTaskRequest();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [isCapabilitiesOpen, setIsCapabilitiesOpen] = useState(false);

  const session = conversation.session;
  const hasConversation = session !== null || conversation.pendingMessage !== null;
  const guard = useUnsavedChangesGuard(hasConversation && starter.startingKey === null);

  function startFromSession(messageId: string, sessionId: string): void {
    void starter.start(messageId, { source: TaskCreationSource.SELECTION_SESSION, selection_session_id: sessionId });
  }

  async function send(text: string): Promise<void> {
    const message = normaliseComposerMessage(text, SELECTION_FIELD_LIMIT.MESSAGE_MAX_LENGTH);
    if (message === null || conversation.isSending) return;
    setDraft("");
    textareaRef.current?.focus();
    const updated = await conversation.send(message);
    if (updated === null) {
      setDraft(message);
      return;
    }
    const newest = updated.messages[updated.messages.length - 1];
    if (newest?.role === SelectionMessageRole.ASSISTANT && newest.decision === SelectionDecisionKind.START_REQUESTED) {
      startFromSession(newest.id, updated.id);
    }
  }

  async function startOver(): Promise<void> {
    setDraft("");
    await conversation.startOver();
    textareaRef.current?.focus();
  }

  const actions: AssistantMessageActions = {
    isSending: conversation.isSending,
    startingKey: starter.startingKey,
    startError: starter.error,
    onStart: (messageId) => {
      if (session) startFromSession(messageId, session.id);
    },
    onPickOption: (label) => void send(label),
    onChoose: (workflowTemplateId) => void conversation.choose(workflowTemplateId),
    onBrowse: () => setIsCapabilitiesOpen(true),
    onStartOver: () => void startOver(),
  };

  function renderThread() {
    if (conversation.isRestoring) return <SkeletonRows count={3} label={COPY.restoring} />;
    if (!hasConversation) {
      return (
        <AssistantWelcome
          onOpenCapabilities={() => setIsCapabilitiesOpen(true)}
          onPickSuggestion={(text) => {
            setDraft(text);
            textareaRef.current?.focus();
          }}
        />
      );
    }
    return (
      <AssistantConversation
        messages={session?.messages ?? []}
        pendingMessage={conversation.pendingMessage}
        isSending={conversation.isSending}
        actions={actions}
      />
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-11rem)] flex-1 flex-col">
      <div className="flex flex-1 flex-col">{renderThread()}</div>

      {conversation.error && (
        <div className="mx-auto mb-2 w-full max-w-[760px]">
          <InlineAlert>{conversation.error}</InlineAlert>
        </div>
      )}

      <AssistantComposer
        value={draft}
        onValueChange={setDraft}
        onSubmit={() => void send(draft)}
        isSending={conversation.isSending}
        canStartOver={session !== null}
        onStartOver={() => void startOver()}
        textareaRef={textareaRef}
      />

      {isCapabilitiesOpen && (
        <CapabilitiesDrawer
          startingKey={starter.startingKey}
          startError={starter.error}
          onStart={(workflowTemplateId) =>
            void starter.start(workflowTemplateId, { source: TaskCreationSource.CATALOGUE, workflow_template_id: workflowTemplateId })
          }
          onClose={() => setIsCapabilitiesOpen(false)}
        />
      )}

      {guard.pendingHref !== null && (
        <ConfirmDialog
          title={UI_COPY.leaveTitle}
          confirmLabel={UI_COPY.leaveConfirm}
          cancelLabel={UI_COPY.stay}
          tone="danger"
          onConfirm={guard.confirmLeave}
          onCancel={guard.stay}
        >
          {COPY.discardGuard}
        </ConfirmDialog>
      )}
    </div>
  );
}
