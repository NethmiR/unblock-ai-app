import { Card } from "@/components/ui/Card";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { UserAffiliationSummary } from "@/components/user-affiliations/UserAffiliationSummary";
import { userAffiliationsApi } from "@/lib/api/user-affiliations";
import { ACCOUNT_COPY } from "@/lib/account/account-copy";
import type { UserAffiliationsDto } from "@/types/user-affiliation";

async function loadAffiliations(): Promise<UserAffiliationsDto | null> {
  try {
    return (await userAffiliationsApi.forCurrentUser()).affiliations;
  } catch {
    return null;
  }
}

export async function AccountAffiliationsCard() {
  const affiliations = await loadAffiliations();

  return (
    <Card className="p-6">
      <AccountAffiliationsHeading />
      {affiliations === null ? (
        <InlineAlert>{ACCOUNT_COPY.affiliationsFailed}</InlineAlert>
      ) : (
        <>
          {affiliations.effective_faculties.length > 0 && (
            <p className="mb-4 text-[12.5px] text-muted">
              <span className="font-semibold text-ink">{ACCOUNT_COPY.facultiesLabel}: </span>
              {affiliations.effective_faculties.map((faculty) => faculty.name).join(" · ")}
            </p>
          )}
          <UserAffiliationSummary affiliations={affiliations} />
        </>
      )}
    </Card>
  );
}

export function AccountAffiliationsHeading() {
  return (
    <>
      <h2 className="mb-1 text-[14px] font-semibold tracking-tight">{ACCOUNT_COPY.affiliationsTitle}</h2>
      <p className="mb-4 text-[12.5px] text-muted">{ACCOUNT_COPY.affiliationsDescription}</p>
    </>
  );
}
