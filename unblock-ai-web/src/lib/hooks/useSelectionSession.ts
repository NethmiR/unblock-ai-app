"use client";
import { useCallback, useState } from "react";
import { selectionApi } from "@/lib/api/selection";
import { tasksApi } from "@/lib/api/tasks";
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
  const [pendingMatch, setPendingMatch] = useState<Workflow | null>(null);
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
            // The clarifying questions have landed on one workflow with high
            // confidence. Stage it rather than committing: confirming is what
            // saves the job, and that must not happen until the person agrees
            // this is the process they meant. `confirmMatch` / `rejectMatch`
            // resolve it.
            setPendingMatch(matched);
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

  /**
   * Handles both the first message and every subsequent answer.
   *
   * Once `workflow` is set the session is finalized server-side, and POSTing
   * to /answer would 409 with "No open question to answer on this session".
   * The composer is retired at that point, so this guard is belt-and-braces -
   * it keeps a stray call (quick reply, double submit) from surfacing a raw
   * backend conflict as a chat error.
   */
  const send = useCallback(
    async (text: string) => {
      if (workflow) return;
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
    [sessionId, workflow, push, handleDecision],
  );

  /**
   * Explicit pick from the manual-choice list.
   *
   * Resolves the pick server-side, then stages the workflow exactly as a
   * `matched` decision does. The confirmation popup is the single gate in
   * front of `POST /tasks` for BOTH branches - a pick from a list of similar
   * titles is easy to misread, and committing straight to a saved job would
   * give the person no chance to catch it.
   */
  const choose = useCallback(
    async (workflowId: string) => {
      if (!sessionId) return;
      setIsBusy(true);
      try {
        await selectionApi.choose(sessionId, workflowId);
        setPendingMatch(await selectionApi.getWorkflow(sessionId));
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

  /**
   * Confirmed: this is the process they meant. Save the job.
   *
   * This is the commit point of the whole selection flow. `POST /tasks` turns
   * the resolved session into a stored task whose `requirements` and `steps`
   * are the workflow customized for this requester - which is why the plan is
   * not compiled here: the task page renders it from the saved record, so
   * building a throwaway copy on this page first would only show the person
   * the same thing twice.
   *
   * Returns the new task id so the caller can navigate; `null` means the save
   * failed and the message pushed into the chat already says so. `workflow` is
   * committed on success purely to retire the composer - the session is
   * finalized server-side and any further answer would 409.
   */
  const confirmMatch = useCallback(async (): Promise<string | null> => {
    if (!pendingMatch || !sessionId) return null;
    setIsBusy(true);
    try {
      const task = await tasksApi.create(sessionId);
      setWorkflow(pendingMatch);
      setPendingMatch(null);
      return task.id;
    } catch (err) {
      push({
        role: "system",
        text: err instanceof ApiError
          ? `Something went wrong creating your request: ${err.message}`
          : "Something went wrong creating your request. Please try again.",
      });
      // The staged match is cleared either way: leaving the popup open on a
      // failure would trap the person behind a button that just failed, while
      // dropping back to the chat lets them retry or say something else.
      setPendingMatch(null);
      return null;
    } finally {
      setIsBusy(false);
    }
  }, [pendingMatch, sessionId, push]);

  /**
   * Rejected: we picked the wrong process. Hand it back to the conversation.
   *
   * `sessionId` is deliberately KEPT. The chat is the mechanism for narrowing
   * down the right workflow, so a wrong guess should return the person to it
   * rather than throwing the session away - their next message refines the
   * same session exactly as an answer to a clarifying question would.
   */
  const rejectMatch = useCallback(() => {
    const rejected = pendingMatch;
    setPendingMatch(null);
    push({
      role: "system",
      text: rejected
        ? `Sorry about that - ${rejected.title} isn't the one. Tell me a bit more about what you need and I'll narrow it down again.`
        : "Tell me a bit more about what you need and I'll narrow it down again.",
    });
  }, [pendingMatch, push]);

  // `sessionId` is the seam the whole task flow hangs off - `POST /tasks`
  // takes it, and nothing else in the app knows it.
  return {
    messages,
    sessionId,
    decision,
    workflow,
    pendingMatch,
    isBusy,
    send,
    choose,
    confirmMatch,
    rejectMatch,
    hasStarted: messages.length > 0,
  };
}
