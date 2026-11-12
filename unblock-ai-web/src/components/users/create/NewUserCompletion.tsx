"use client";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/icons/Icon";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { useUser } from "@/lib/hooks/useUserData";
import { RoutePath, userDetailPath } from "@/lib/routing/route-path";
import { USER_MANAGEMENT_COPY } from "@/lib/user-management/user-management-copy";
import { IconName } from "@/types/icon";

const COPY = USER_MANAGEMENT_COPY.create;

export function NewUserCompletion({ userId }: { userId: string }) {
  const { data } = useUser(userId);
  if (!data) return <SkeletonRows count={1} label={USER_MANAGEMENT_COPY.detail.loading} />;

  return (
    <Card className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
        <Icon name={IconName.CHECK} className="h-6 w-6" />
      </span>
      <h2 className="text-[18px] font-bold tracking-tight text-ink">{COPY.doneTitle(data.user.full_name)}</h2>
      <p className="mt-2 max-w-[46ch] text-[13.5px] leading-relaxed text-muted">{COPY.doneBody}</p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <ButtonLink href={RoutePath.USERS_NEW} variant="secondary" leadingIcon={IconName.PLUS}>
          {COPY.createAnother}
        </ButtonLink>
        <ButtonLink href={userDetailPath(userId)}>{COPY.viewUser}</ButtonLink>
      </div>
    </Card>
  );
}
