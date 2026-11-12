"use client";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { useSession } from "@/components/providers/SessionProvider";
import { DASHBOARD_COPY } from "@/lib/constants/ui-copy";
import { RoutePath } from "@/lib/routing/route-path";

/** The signed-in user's name, email and avatar - links to their profile. */
export function TopbarUserSummary() {
  const { user, initials } = useSession();

  return (
    <Link
      href={RoutePath.PROFILE}
      title={DASHBOARD_COPY.viewProfile}
      className="flex flex-none items-center gap-3 rounded-pill py-1 pl-3 pr-1 transition-colors hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <span className="hidden min-w-0 flex-col items-end leading-tight sm:flex">
        <span className="max-w-[220px] truncate text-[13px] font-semibold text-ink">{user.full_name}</span>
        <span className="max-w-[220px] truncate text-[11.5px] text-muted">{user.email}</span>
      </span>
      <Avatar initials={initials} />
    </Link>
  );
}
