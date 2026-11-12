import { Suspense } from "react";
import { AccountAffiliationsCard, AccountAffiliationsHeading } from "@/components/account/AccountAffiliationsCard";
import { AccountProfileCard } from "@/components/account/AccountProfileCard";
import { ActiveSessionList } from "@/components/account/ActiveSessionList";
import { PermissionBadgeList } from "@/components/account/PermissionBadgeList";
import { Card } from "@/components/ui/Card";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { ACCOUNT_COPY } from "@/lib/account/account-copy";
import { requireRouteAccess } from "@/lib/auth/session";
import { dashboardPageMetadata } from "@/lib/navigation/page-metadata";
import { RoutePath } from "@/lib/routing/route-path";

const ROUTE = RoutePath.PROFILE;

export const metadata = dashboardPageMetadata(ROUTE);

export default async function ProfilePage() {
  const session = await requireRouteAccess(ROUTE);

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6">
      <AccountProfileCard fullName={session.user.full_name} email={session.user.email} initials={session.initials} />

      <Suspense
        fallback={
          <Card className="p-6">
            <AccountAffiliationsHeading />
            <SkeletonRows count={2} label={ACCOUNT_COPY.loadingAffiliations} />
          </Card>
        }
      >
        <AccountAffiliationsCard />
      </Suspense>

      <Card className="p-6">
        <h2 className="mb-1 text-[14px] font-semibold tracking-tight">{ACCOUNT_COPY.permissionsTitle}</h2>
        <p className="mb-4 text-[12.5px] text-muted">{ACCOUNT_COPY.permissionsDescription}</p>
        <PermissionBadgeList permissions={session.user.permissions} />
      </Card>

      <Card className="p-6">
        <h2 className="mb-1 text-[14px] font-semibold tracking-tight">{ACCOUNT_COPY.sessionsTitle}</h2>
        <p className="mb-4 text-[12.5px] text-muted">{ACCOUNT_COPY.sessionsDescription}</p>
        <ActiveSessionList />
      </Card>
    </div>
  );
}
