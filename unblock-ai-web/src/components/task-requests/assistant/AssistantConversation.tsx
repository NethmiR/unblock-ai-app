"use client";
import { useEffect, useRef } from "react";
import { AssistantMessage, type AssistantMessageActions } from "./AssistantMessage";
import { AssistantTypingIndicator } from "./AssistantTypingIndicator";
import { RequesterMessageBubble } from "./RequesterMessageBubble";
import { isAssistantMessage, newestAssistantMessageId } from "@/lib/task-request/selection-conversation";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import type { SelectionMessageDto } from "@/types/selection";

interface AssistantConversationProps {
  messages: readonly SelectionMessageDto[];
  pendingMessage: string | null;
  isSending: boolean;
  actions: AssistantMessageActions;
}

export function AssistantConversation({ messages, pendingMessage, isSending, actions }: AssistantConversationProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const newestId = newestAssistantMessageId(messages);
  const isNewestLast = messages.length > 0 && messages[messages.length - 1].id === newestId;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pendingMessage, isSending]);

  return (
    <div role="log" aria-live="polite" aria-label={TASK_REQUEST_COPY.assistant.conversationLabel} className="mx-auto flex w-full max-w-[760px] flex-col gap-6 py-4">
      {messages.map((message) =>
        isAssistantMessage(message) ? (
          <AssistantMessage key={message.id} message={message} isNewest={isNewestLast && message.id === newestId} actions={actions} />
        ) : (
          <RequesterMessageBubble key={message.id} text={message.text} />
        ),
      )}
      {pendingMessage !== null && <RequesterMessageBubble text={pendingMessage} pending />}
      {isSending && <AssistantTypingIndicator />}
      <div ref={endRef} />
    </div>
  );
}
