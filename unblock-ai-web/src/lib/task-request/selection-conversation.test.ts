import { describe, expect, it } from "vitest";
import {
  INITIAL_SELECTION_CONVERSATION_STATE,
  SelectionConversationActionKind,
  newestAssistantMessageId,
  normaliseComposerMessage,
  selectionConversationReducer,
} from "./selection-conversation";
import { SelectionDecisionKind, SelectionMessageRole, type SelectionMessageDto } from "@/types/selection";

describe("selectionConversationReducer", () => {
  it("shows an optimistic requester bubble while sending and clears it on success", () => {
    const sending = selectionConversationReducer(INITIAL_SELECTION_CONVERSATION_STATE, {
      kind: SelectionConversationActionKind.SEND_STARTED,
      text: "Overseas leave",
    });
    expect(sending).toEqual({ pendingMessage: "Overseas leave", isSending: true, error: null });
    expect(selectionConversationReducer(sending, { kind: SelectionConversationActionKind.REQUEST_SUCCEEDED })).toEqual(
      INITIAL_SELECTION_CONVERSATION_STATE,
    );
  });

  it("drops the bubble and keeps the error on failure, until dismissed", () => {
    const failed = selectionConversationReducer(
      { pendingMessage: "x", isSending: true, error: null },
      { kind: SelectionConversationActionKind.REQUEST_FAILED, error: "Nope" },
    );
    expect(failed).toEqual({ pendingMessage: null, isSending: false, error: "Nope" });
    expect(selectionConversationReducer(failed, { kind: SelectionConversationActionKind.ERROR_DISMISSED }).error).toBeNull();
  });

  it("marks a choice as in flight without a bubble, and resets", () => {
    const choosing = selectionConversationReducer(INITIAL_SELECTION_CONVERSATION_STATE, { kind: SelectionConversationActionKind.CHOOSE_STARTED });
    expect(choosing).toEqual({ pendingMessage: null, isSending: true, error: null });
    expect(selectionConversationReducer(choosing, { kind: SelectionConversationActionKind.RESET })).toEqual(INITIAL_SELECTION_CONVERSATION_STATE);
  });
});

describe("conversation helpers", () => {
  it("finds the newest assistant message", () => {
    const messages: SelectionMessageDto[] = [
      { id: "m1", role: SelectionMessageRole.REQUESTER, text: "hi", sent_at: "" },
      {
        id: "m2",
        role: SelectionMessageRole.ASSISTANT,
        decision: SelectionDecisionKind.AMBIGUOUS,
        question: "Which?",
        options: [],
        match: null,
        trace: [],
        sent_at: "",
      },
      { id: "m3", role: SelectionMessageRole.REQUESTER, text: "this one", sent_at: "" },
    ];
    expect(newestAssistantMessageId(messages)).toBe("m2");
    expect(newestAssistantMessageId([])).toBeNull();
  });

  it("trims composer text and rejects blank or oversized messages", () => {
    expect(normaliseComposerMessage("  hello  ", 10)).toBe("hello");
    expect(normaliseComposerMessage("   ", 10)).toBeNull();
    expect(normaliseComposerMessage("x".repeat(11), 10)).toBeNull();
  });
});
