"use client";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Drawer } from "@/components/ui/Drawer";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { useHasPermission } from "@/components/providers/SessionProvider";
import { useOrganisationalUnitMembers } from "@/lib/hooks/useOrganisationData";
import { ORGANISATION_COPY } from "@/lib/organisation/organisation-copy";
import { userDetailPath } from "@/lib/routing/route-path";
import { initialsOf } from "@/lib/utils/initials";
import { Permission } from "@/types/permission";
import type { OrganisationalUnitSummaryDto } from "@/types/organisational-unit";

const COPY = ORGANISATION_COPY.members;

interface OrganisationalUnitMembersDrawerProps {
  unit: OrganisationalUnitSummaryDto;
  onClose: () => void;
}

export function OrganisationalUnitMembersDrawer({ unit, onClose }: OrganisationalUnitMembersDrawerProps) {
  const { data, error, isLoading, mutate } = useOrganisationalUnitMembers(unit.id);
  const canOpenUsers = useHasPermission(Permission.USER_MANAGE);

  return (
    <Drawer title={COPY.title(unit.name)} description={COPY.description} onClose={onClose}>
      {isLoading && <SkeletonRows count={4} label={COPY.loading} />}
      {error !== undefined && !isLoading && <InlineAlert onRetry={() => void mutate()}>{ORGANISATION_COPY.loadFailed}</InlineAlert>}
      {data && data.members.length === 0 && <p className="py-10 text-center text-[13.5px] text-muted">{COPY.empty}</p>}
      {data && data.members.length > 0 && (
        <ul className="divide-y divide-line-admin">
          {data.members.map((member) => {
            const content = (
              <>
                <Avatar initials={initialsOf(member.user.full_name)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">{member.user.full_name}</span>
                  <span className="block truncate text-[12px] text-muted">{member.user.email}</span>
                </span>
                <span className="flex flex-wrap justify-end gap-1.5">
                  {member.designations.length === 0 ? (
                    <Badge>{COPY.noDesignation}</Badge>
                  ) : (
                    member.designations.map((designation) => (
                      <Badge key={designation.id} tone="accent">
                        {designation.title}
                      </Badge>
                    ))
                  )}
                </span>
              </>
            );
            return (
              <li key={member.user.id}>
                {canOpenUsers ? (
                  <Link
                    href={userDetailPath(member.user.id)}
                    aria-label={COPY.openUser(member.user.full_name)}
                    className="-mx-2 flex items-center gap-3 rounded-control px-2 py-3 hover:bg-bg"
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 py-3">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Drawer>
  );
}
