"use client";
import { useCallback, useState } from "react";
import { selectionApi } from "@/lib/api/selection";
import { getRequesterContext, getSession } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/client";
import type { SelectionResponse } from "@/types/selection";
import type { Workflow } from "@/types/workflow";

export interface ChatMessage {
  id: string;
  role: "user" | "system" | "waiting";
  text: string;
  options?: string[];
}

/**
 * Drives one selection conversation.
 *
 * Single source of truth for: the message list, the session id, the current
 * decision, and the matched workflow. Components render this state and call
 * `send`; they never talk to the API themselves.
 */
export function useSelectionSession() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [decision, setDecision] = useState<SelectionResponse | null>(null);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const push = useCallback((message: Omit<ChatMessage, "id">) => {
    setMessages((prev) => [...prev, { ...message, id: `${prev.length}-${message.role}` }]);
  }, []);

  /**
   * Translates a decision into what the person sees.
   *
   * The four branches here ARE the product. Each one is a deliberate UX choice
   * about how to handle uncertainty, and none of them may silently guess.
   */
  const handleDecision = useCallback(
    async (response: SelectionResponse) => {
      setSessionId(response.session_id);
      setDecision(response);

      switch (response.decision) {
        case "ambiguous":
          // Ask the ONE question, offering its options as quick replies.
          push({ role: "system", text: response.question!, options: response.options });
          break;

        case "manual_choice":
          // Two rounds spent. Stop guessing, show the list.
          push({
            role: "system",
            text: response.question ?? "I could not narrow it down. Which of these do you want?",
            options: response.candidates.map((c) => c.title),
          });
          break;

        case "no_match":
          // Say so honestly. Never stretch to the nearest option.
          push({
            role: "system",
            text: "I could not find a workflow that matches that. Could you describe what you need differently, or tell me which department handles it?",
          });
          break;

        case "matched": {
          try {
            const matched = await selectionApi.getWorkflow(response.session_id);
            setWorkflow(matched);
            push({
              role: "system",
              text: `I'll use ${matched.title}. Review the steps on the right and submit when you're ready.`,
            });
          } catch (err) {
            push({
              role: "system",
              text: err instanceof ApiError
                ? `Something went wrong loading the matched workflow: ${err.message}`
                : "Something went wrong loading the matched workflow. Please try again.",
            });
          }
          break;
        }
      }
    },
    [push],
  );

  /** Handles both the first message and every subsequent answer. */
  const send = useCallback(
    async (text: string) => {
      push({ role: "user", text });
      setIsBusy(true);
      try {
        const response = sessionId
          ? await selectionApi.answer(sessionId, text)
          : await selectionApi.start(text, getRequesterContext(getSession("requester")));
        await handleDecision(response);
      } catch (err) {
        push({
          role: "system",
          text: err instanceof ApiError
            ? `Something went wrong: ${err.message}`
            : "Something went wrong. Please try again.",
        });
      } finally {
        setIsBusy(false);
      }
    },
    [sessionId, push, handleDecision],
  );

  /** Explicit pick from the manual-choice list. */
  const choose = useCallback(
    async (workflowId: string) => {
      if (!sessionId) return;
      setIsBusy(true);
      try {
        await selectionApi.choose(sessionId, workflowId);
        const matched = await selectionApi.getWorkflow(sessionId);
        setWorkflow(matched);
        push({ role: "system", text: `I'll use ${matched.title}. Review the steps on the right.` });
      } catch (err) {
        push({
          role: "system",
          text: err instanceof ApiError
            ? `Something went wrong: ${err.message}`
            : "Something went wrong. Please try again.",
        });
      } finally {
        setIsBusy(false);
      }
    },
    [sessionId, push],
  );

  return { messages, decision, workflow, isBusy, send, choose, hasStarted: messages.length > 0 };
}
