import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { LegacyRoutePath, loginPathFor } from "@/lib/routing/route-path";
import { AccountProfileCard } from "@/components/account/AccountProfileCard";
import { PermissionBadgeList } from "@/components/account/PermissionBadgeList";
import { ActiveSessionList } from "@/components/account/ActiveSessionList";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect(loginPathFor(LegacyRoutePath.ACCOUNT));

  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-6 py-10">
      <AccountProfileCard fullName={session.user.full_name} email={session.user.email} initials={session.initials} />

      <Card className="p-6">
        <h2 className="mb-1 text-[14px] font-semibold tracking-tight">Permissions</h2>
        <p className="mb-4 text-[12.5px] text-muted">What your account is allowed to do.</p>
        <PermissionBadgeList permissions={session.user.permissions} />
      </Card>

      <Card className="p-6">
        <h2 className="mb-1 text-[14px] font-semibold tracking-tight">Active sessions</h2>
        <p className="mb-4 text-[12.5px] text-muted">Devices currently signed in to your account.</p>
        <ActiveSessionList />
      </Card>
    </main>
  );
}
