import { ORGANISATION_COPY } from "@/lib/organisation/organisation-copy";

export function NoMatchingResults({ message = ORGANISATION_COPY.noSearchResults }: { message?: string }) {
  return (
    <p className="rounded-card border border-dashed border-line-admin py-12 text-center text-[13.5px] text-muted">{message}</p>
  );
}
