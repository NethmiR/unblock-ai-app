"use client";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DateTime } from "@/components/ui/DateTime";
import type { UserSession } from "@/types/auth";

interface ActiveSessionRowProps {
  session: UserSession;
  disabled: boolean;
  onRevoke: (session: UserSession) => void;
}

export function ActiveSessionRow({ session, disabled, onRevoke }: ActiveSessionRowProps) {
  return (
    <li className="flex items-center justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-medium text-ink">{session.user_agent ?? "Unknown device"}</span>
          {session.is_current && <Badge tone="success">This device</Badge>}
        </div>
        <div className="mt-1 text-[12px] text-muted">
          Signed in <DateTime iso={session.created_at} /> · Last active <DateTime iso={session.last_seen_at} />
        </div>
      </div>
      {!session.is_current && (
        <Button variant="secondary" size="sm" disabled={disabled} onClick={() => onRevoke(session)}>
          Sign out
        </Button>
      )}
    </li>
  );
}
