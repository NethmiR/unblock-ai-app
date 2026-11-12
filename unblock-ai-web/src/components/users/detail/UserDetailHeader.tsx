import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DateTime } from "@/components/ui/DateTime";
import { USER_MANAGEMENT_COPY } from "@/lib/user-management/user-management-copy";
import { USER_STATUS_BADGES } from "@/lib/user-management/user-status";
import { initialsOf } from "@/lib/utils/initials";
import type { OrganisationalUnitReferenceDto } from "@/types/organisational-unit";
import type { UserDto } from "@/types/user";

const COPY = USER_MANAGEMENT_COPY.detail;

interface UserDetailHeaderProps {
  user: UserDto;
  effectiveFaculties: readonly OrganisationalUnitReferenceDto[];
}

export function UserDetailHeader({ user, effectiveFaculties }: UserDetailHeaderProps) {
  const status = USER_STATUS_BADGES[user.status];

  return (
    <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        <Avatar initials={initialsOf(user.full_name)} size="lg" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-[18px] font-bold tracking-tight text-ink">{user.full_name}</h2>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <p className="truncate text-[13px] text-muted">{user.email}</p>
          {effectiveFaculties.length > 0 && (
            <p className="mt-1 truncate text-[12.5px] text-muted">{effectiveFaculties.map((faculty) => faculty.name).join(" · ")}</p>
          )}
        </div>
      </div>
      <dl className="grid flex-none grid-cols-2 gap-x-6 gap-y-1 text-[12px] sm:text-right">
        <dt className="text-faint">{COPY.created}</dt>
        <dt className="text-faint">{COPY.lastSignIn}</dt>
        <dd className="text-ink">
          <DateTime iso={user.created_at} />
        </dd>
        <dd className="text-ink">{user.last_login_at ? <DateTime iso={user.last_login_at} /> : COPY.neverSignedIn}</dd>
      </dl>
    </Card>
  );
}
