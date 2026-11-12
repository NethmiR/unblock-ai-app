"use client";
import { Card } from "@/components/ui/Card";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { PermissionBadgeList } from "@/components/account/PermissionBadgeList";
import { UserAffiliationEditor } from "@/components/user-affiliations/UserAffiliationEditor";
import { UserDetailHeader } from "./UserDetailHeader";
import { useUser, useUserAffiliations } from "@/lib/hooks/useUserData";
import { USER_AFFILIATION_COPY } from "@/lib/user-affiliation/user-affiliation-copy";
import { USER_MANAGEMENT_COPY } from "@/lib/user-management/user-management-copy";

const COPY = USER_MANAGEMENT_COPY.detail;

export function UserDetailScreen({ userId }: { userId: string }) {
  const userQuery = useUser(userId);
  const affiliationsQuery = useUserAffiliations(userId);

  if (userQuery.error !== undefined || affiliationsQuery.error !== undefined) {
    return (
      <InlineAlert
        onRetry={() => {
          void userQuery.mutate();
          void affiliationsQuery.mutate();
        }}
      >
        {COPY.loadFailed}
      </InlineAlert>
    );
  }
  if (!userQuery.data || !affiliationsQuery.data) return <SkeletonRows count={4} label={COPY.loading} />;

  const { user } = userQuery.data;
  const { affiliations } = affiliationsQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <UserDetailHeader user={user} effectiveFaculties={affiliations.effective_faculties} />

      <Card className="p-6">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{USER_AFFILIATION_COPY.sectionTitle}</h2>
        <p className="mb-5 mt-1 max-w-[80ch] text-[12.5px] leading-relaxed text-muted">{USER_AFFILIATION_COPY.sectionDescription}</p>
        <UserAffiliationEditor
          userId={user.id}
          affiliations={affiliations}
          onSaved={(saved) => void affiliationsQuery.mutate({ affiliations: saved }, { revalidate: false })}
        />
      </Card>

      <Card className="p-6">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{COPY.functionsTitle}</h2>
        <p className="mb-4 mt-1 text-[12.5px] text-muted">{COPY.functionsDescription}</p>
        <PermissionBadgeList permissions={user.permissions} />
      </Card>
    </div>
  );
}
