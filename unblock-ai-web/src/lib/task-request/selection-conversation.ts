import {
  SelectionMessageRole,
  type AssistantSelectionMessageDto,
  type SelectionMessageDto,
} from "@/types/selection";

export interface SelectionConversationState {
  pendingMessage: string | null;
  isSending: boolean;
  error: string | null;
}

export enum SelectionConversationActionKind {
  SEND_STARTED = "send_started",
  CHOOSE_STARTED = "choose_started",
  REQUEST_SUCCEEDED = "request_succeeded",
  REQUEST_FAILED = "request_failed",
  ERROR_DISMISSED = "error_dismissed",
  RESET = "reset",
}

export type SelectionConversationAction =
  | { kind: SelectionConversationActionKind.SEND_STARTED; text: string }
  | { kind: SelectionConversationActionKind.CHOOSE_STARTED }
  | { kind: SelectionConversationActionKind.REQUEST_SUCCEEDED }
  | { kind: SelectionConversationActionKind.REQUEST_FAILED; error: string }
  | { kind: SelectionConversationActionKind.ERROR_DISMISSED }
  | { kind: SelectionConversationActionKind.RESET };

export const INITIAL_SELECTION_CONVERSATION_STATE: SelectionConversationState = {
  pendingMessage: null,
  isSending: false,
  error: null,
};

export function selectionConversationReducer(
  state: SelectionConversationState,
  action: SelectionConversationAction,
): SelectionConversationState {
  switch (action.kind) {
    case SelectionConversationActionKind.SEND_STARTED:
      return { pendingMessage: action.text, isSending: true, error: null };
    case SelectionConversationActionKind.CHOOSE_STARTED:
      return { pendingMessage: null, isSending: true, error: null };
    case SelectionConversationActionKind.REQUEST_SUCCEEDED:
      return INITIAL_SELECTION_CONVERSATION_STATE;
    case SelectionConversationActionKind.REQUEST_FAILED:
      return { pendingMessage: null, isSending: false, error: action.error };
    case SelectionConversationActionKind.ERROR_DISMISSED:
      return { ...state, error: null };
    case SelectionConversationActionKind.RESET:
      return INITIAL_SELECTION_CONVERSATION_STATE;
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

export function isAssistantMessage(message: SelectionMessageDto): message is AssistantSelectionMessageDto {
  return message.role === SelectionMessageRole.ASSISTANT;
}

export function newestAssistantMessageId(messages: readonly SelectionMessageDto[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (isAssistantMessage(message)) return message.id;
  }
  return null;
}

export function normaliseComposerMessage(text: string, maxLength: number): string | null {
  const trimmed = text.trim();
  return trimmed === "" || trimmed.length > maxLength ? null : trimmed;
}
