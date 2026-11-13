"use client";
import { useReducer } from "react";
import useSWR, { mutate } from "swr";
import { fetcher } from "@/lib/api/client";
import { selectionApi, selectionSessionPath } from "@/lib/api/selection";
import { useQueryParams } from "./useQueryParams";
import {
  INITIAL_SELECTION_CONVERSATION_STATE,
  SelectionConversationActionKind,
  selectionConversationReducer,
} from "@/lib/task-request/selection-conversation";
import { SELECTION_SESSION_QUERY_PARAMETER } from "@/lib/task-request/task-request-constant";
import { TASK_REQUEST_COPY } from "@/lib/task-request/task-request-copy";
import { hasErrorCode, taskRequestErrorMessage } from "@/lib/task-request/task-error-message";
import { SelectionErrorCode, type SelectionSessionDto } from "@/types/selection";

type SessionParam = typeof SELECTION_SESSION_QUERY_PARAMETER;

export interface SelectionConversation {
  session: SelectionSessionDto | null;
  isRestoring: boolean;
  pendingMessage: string | null;
  isSending: boolean;
  error: string | null;
  send: (text: string) => Promise<SelectionSessionDto | null>;
  choose: (workflowTemplateId: string) => Promise<void>;
  startOver: () => Promise<void>;
  dismissError: () => void;
}

export function useSelectionConversation(): SelectionConversation {
  const params = useQueryParams<SessionParam>();
  const sessionId = params.get(SELECTION_SESSION_QUERY_PARAMETER);
  const [state, dispatch] = useReducer(selectionConversationReducer, INITIAL_SELECTION_CONVERSATION_STATE);

  const forgetSession = () => params.set({ [SELECTION_SESSION_QUERY_PARAMETER]: null });

  const { data, isLoading } = useSWR<SelectionSessionDto>(sessionId ? selectionSessionPath(sessionId) : null, fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    onError: (err: unknown) => {
      if (!hasErrorCode(err, SelectionErrorCode.SELECTION_SESSION_NOT_FOUND)) return;
      dispatch({ kind: SelectionConversationActionKind.REQUEST_FAILED, error: TASK_REQUEST_COPY.assistant.sessionExpired });
      forgetSession();
    },
  });

  const adopt = async (session: SelectionSessionDto) => {
      await mutate(selectionSessionPath(session.id), session, { revalidate: false });
      if (session.id !== sessionId) params.set({ [SELECTION_SESSION_QUERY_PARAMETER]: session.id });
      dispatch({ kind: SelectionConversationActionKind.REQUEST_SUCCEEDED });
    };

  const fail = (err: unknown, fallback: string) => {
      dispatch({ kind: SelectionConversationActionKind.REQUEST_FAILED, error: taskRequestErrorMessage(err, fallback) });
      if (hasErrorCode(err, SelectionErrorCode.SELECTION_SESSION_NOT_FOUND)) forgetSession();
    };

  const send = async (text: string): Promise<SelectionSessionDto | null> => {
      dispatch({ kind: SelectionConversationActionKind.SEND_STARTED, text });
      try {
        const session = sessionId ? await selectionApi.sendMessage(sessionId, text) : await selectionApi.start(text);
        await adopt(session);
        return session;
      } catch (err) {
        fail(err, TASK_REQUEST_COPY.assistant.sendFailed);
        return null;
      }
    };

  const choose = async (workflowTemplateId: string) => {
      if (!sessionId) return;
      dispatch({ kind: SelectionConversationActionKind.CHOOSE_STARTED });
      try {
        await adopt(await selectionApi.choose(sessionId, workflowTemplateId));
      } catch (err) {
        fail(err, TASK_REQUEST_COPY.assistant.sendFailed);
      }
    };

  const startOver = async () => {
    dispatch({ kind: SelectionConversationActionKind.RESET });
    if (!sessionId) return;
    forgetSession();
    await mutate(selectionSessionPath(sessionId), undefined, { revalidate: false });
    await selectionApi.discard(sessionId).catch(() => undefined);
  };

  const dismissError = () => dispatch({ kind: SelectionConversationActionKind.ERROR_DISMISSED });

  return {
    session: sessionId ? (data ?? null) : null,
    isRestoring: sessionId !== null && data === undefined && isLoading,
    pendingMessage: state.pendingMessage,
    isSending: state.isSending,
    error: state.error,
    send,
    choose,
    startOver,
    dismissError,
  };
}
