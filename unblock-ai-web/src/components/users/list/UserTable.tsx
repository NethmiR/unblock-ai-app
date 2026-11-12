import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { CodeChip } from "@/components/ui/CodeChip";
import { DateTime } from "@/components/ui/DateTime";
import { Table, TableCell, TableHeader, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { userDetailPath } from "@/lib/routing/route-path";
import { USER_MANAGEMENT_COPY } from "@/lib/user-management/user-management-copy";
import { USER_STATUS_BADGES, VISIBLE_UNIT_CHIPS } from "@/lib/user-management/user-status";
import { initialsOf } from "@/lib/utils/initials";
import type { UserListItemDto } from "@/types/user";

const COPY = USER_MANAGEMENT_COPY.list;
const COLUMNS = "minmax(0,1.6fr) minmax(0,1.4fr) 6.5rem 10rem";

export function UserTable({ users }: { users: readonly UserListItemDto[] }) {
  return (
    <Table columns={COLUMNS} label={COPY.tableLabel}>
      <TableHeader>
        <TableHeaderCell>{COPY.columns.user}</TableHeaderCell>
        <TableHeaderCell>{COPY.columns.affiliations}</TableHeaderCell>
        <TableHeaderCell>{COPY.columns.status}</TableHeaderCell>
        <TableHeaderCell>{COPY.columns.lastSignIn}</TableHeaderCell>
      </TableHeader>

      {users.map((user) => {
        const visibleUnits = user.organisational_units.slice(0, VISIBLE_UNIT_CHIPS);
        const hiddenUnits = user.organisational_units.slice(VISIBLE_UNIT_CHIPS);
        const status = USER_STATUS_BADGES[user.status];
        return (
          <TableRow key={user.id} className="relative hover:bg-bg">
            <TableCell>
              <span className="flex items-center gap-3">
                <Avatar initials={initialsOf(user.full_name)} />
                <span className="min-w-0">
                  <Link
                    href={userDetailPath(user.id)}
                    aria-label={COPY.openUser(user.full_name)}
                    className="block truncate font-semibold text-ink after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-accent/40"
                  >
                    {user.full_name}
                  </Link>
                  <span className="block truncate text-[12px] text-muted">{user.email}</span>
                </span>
              </span>
            </TableCell>
            <TableCell>
              {user.organisational_units.length === 0 ? (
                <span className="text-muted">{COPY.noAffiliations}</span>
              ) : (
                <span className="flex flex-wrap items-center gap-1.5">
                  {visibleUnits.map((unit) => (
                    <span key={unit.id} title={unit.name}>
                      <CodeChip code={unit.code} />
                    </span>
                  ))}
                  {hiddenUnits.length > 0 && (
                    <span className="text-[12px] text-muted" title={hiddenUnits.map((unit) => unit.name).join(", ")}>
                      {COPY.moreUnits(hiddenUnits.length)}
                    </span>
                  )}
                </span>
              )}
            </TableCell>
            <TableCell>
              <Badge tone={status.tone}>{status.label}</Badge>
            </TableCell>
            <TableCell className="text-[12.5px] text-muted">
              {user.last_login_at ? <DateTime iso={user.last_login_at} /> : COPY.neverSignedIn}
            </TableCell>
          </TableRow>
        );
      })}
    </Table>
  );
}
