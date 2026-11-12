"use client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { UserAffiliationEditor } from "@/components/user-affiliations/UserAffiliationEditor";
import { useUser, useUserAffiliations } from "@/lib/hooks/useUserData";
import { USER_AFFILIATION_COPY } from "@/lib/user-affiliation/user-affiliation-copy";
import { USER_MANAGEMENT_COPY } from "@/lib/user-management/user-management-copy";

const COPY = USER_MANAGEMENT_COPY.create;

interface NewUserAffiliationsStepProps {
  userId: string;
  onFinished: () => void;
}

export function NewUserAffiliationsStep({ userId, onFinished }: NewUserAffiliationsStepProps) {
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
  if (!userQuery.data || !affiliationsQuery.data) return <SkeletonRows count={3} label={USER_AFFILIATION_COPY.loading} />;

  return (
    <Card className="p-6">
      <h2 className="text-[15px] font-semibold tracking-tight text-ink">{COPY.affiliationsTitle(userQuery.data.user.full_name)}</h2>
      <p className="mb-5 mt-1 text-[12.5px] leading-relaxed text-muted">{USER_AFFILIATION_COPY.sectionDescription}</p>
      <UserAffiliationEditor
        userId={userId}
        affiliations={affiliationsQuery.data.affiliations}
        renderActions={({ isDirty, busy, save }) => (
          <div className="mt-2 flex flex-col-reverse gap-2 border-t border-line-admin pt-5 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onFinished} disabled={busy || isDirty}>
              {COPY.skip}
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (!isDirty || (await save())) onFinished();
              }}
            >
              {busy ? COPY.finishing : COPY.saveAndFinish}
            </Button>
          </div>
        )}
      />
    </Card>
  );
}
