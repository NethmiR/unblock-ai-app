"use client";
import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner } from "@/components/ui/Spinner";
import { ActiveSessionRow } from "./ActiveSessionRow";
import { ApiError, fetcher } from "@/lib/api/client";
import { USER_SESSIONS_PATH, userSessionsApi } from "@/lib/api/user-sessions";
import { messageForAuthError } from "@/lib/auth/auth-error-message";
import type { UserSession, UserSessionListResponse } from "@/types/auth";

enum RevocationScope {
  SINGLE = "single",
  OTHERS = "others",
}

type PendingRevocation = { scope: RevocationScope.SINGLE; session: UserSession } | { scope: RevocationScope.OTHERS };

function errorMessage(err: unknown): string {
  return messageForAuthError(err instanceof ApiError ? err.code : undefined);
}

export function ActiveSessionList() {
  const { data, error, isLoading, mutate } = useSWR<UserSessionListResponse>(USER_SESSIONS_PATH, fetcher);
  const [pending, setPending] = useState<PendingRevocation | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function confirmRevocation() {
    if (!pending) return;
    setIsBusy(true);
    setActionError(null);
    try {
      if (pending.scope === RevocationScope.SINGLE) await userSessionsApi.revoke(pending.session.id);
      else await userSessionsApi.revokeOthers();
      setPending(null);
      await mutate();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setIsBusy(false);
    }
  }

  if (isLoading) return <Spinner />;
  if (error || !data) return <p className="text-[12.5px] text-danger">{errorMessage(error)}</p>;

  const hasOtherSessions = data.sessions.some((session) => !session.is_current);

  return (
    <>
      <ul className="divide-y divide-line-admin">
        {data.sessions.map((session) => (
          <ActiveSessionRow
            key={session.id}
            session={session}
            disabled={isBusy}
            onRevoke={(target) => setPending({ scope: RevocationScope.SINGLE, session: target })}
          />
        ))}
      </ul>

      {hasOtherSessions && (
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" size="sm" disabled={isBusy} onClick={() => setPending({ scope: RevocationScope.OTHERS })}>
            Sign out of other sessions
          </Button>
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title={pending.scope === RevocationScope.SINGLE ? "Sign out this session?" : "Sign out of all other sessions?"}
          confirmLabel="Sign out"
          busyLabel="Signing out…"
          tone="danger"
          busy={isBusy}
          error={actionError}
          onConfirm={confirmRevocation}
          onCancel={() => {
            setPending(null);
            setActionError(null);
          }}
        >
          {pending.scope === RevocationScope.SINGLE
            ? `${pending.session.user_agent ?? "This device"} will be signed out immediately.`
            : "Every device except this one will be signed out immediately."}
        </ConfirmDialog>
      )}
    </>
  );
}
