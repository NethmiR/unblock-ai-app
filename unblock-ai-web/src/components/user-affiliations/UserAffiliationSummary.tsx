import { Badge } from "@/components/ui/Badge";
import { OrganisationalUnitName } from "@/components/organisation/shared/OrganisationalUnitName";
import { ORGANISATIONAL_UNIT_TYPE_LABELS } from "@/lib/organisation/organisational-unit-label";
import { groupByEffectiveFaculty } from "@/lib/user-affiliation/affiliation-grouping";
import { USER_AFFILIATION_COPY } from "@/lib/user-affiliation/user-affiliation-copy";
import type { UserAffiliationsDto } from "@/types/user-affiliation";

const COPY = USER_AFFILIATION_COPY;

export function UserAffiliationSummary({ affiliations }: { affiliations: UserAffiliationsDto }) {
  if (affiliations.memberships.length === 0) return <p className="text-[13px] text-muted">{COPY.readOnlyEmpty}</p>;

  const groups = groupByEffectiveFaculty(affiliations.memberships, (membership) => membership.organisational_unit);

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group.faculty?.id ?? COPY.universityLevel} aria-label={group.faculty?.name ?? COPY.universityLevel}>
          <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-faint">{group.faculty?.name ?? COPY.universityLevel}</h3>
          <ul className="divide-y divide-line-admin rounded-card border border-line-admin">
            {group.items.map((membership) => (
              <li key={membership.organisational_unit.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <OrganisationalUnitName unit={membership.organisational_unit} wrap className="text-[13.5px]" />
                  <p className="mt-0.5 text-[12px] text-muted">{ORGANISATIONAL_UNIT_TYPE_LABELS[membership.organisational_unit.unit_type].singular}</p>
                </div>
                <div className="flex flex-wrap gap-1.5 sm:justify-end">
                  {membership.designations.length === 0 ? (
                    <Badge>{COPY.memberOnly}</Badge>
                  ) : (
                    membership.designations.map((designation) => (
                      <Badge key={designation.id} tone="accent">
                        {designation.title}
                      </Badge>
                    ))
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
