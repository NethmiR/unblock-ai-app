import { DESIGNATION_CATEGORY_LABELS } from "@/lib/organisation/designation-category-label";
import { USER_AFFILIATION_COPY } from "./user-affiliation-copy";
import type { ComboboxOption } from "@/types/combobox";
import type { DesignationSummaryDto } from "@/types/designation";
import type { OrganisationalUnitMemberDto } from "@/types/organisational-unit";

export function singleHolderNames(
  members: readonly OrganisationalUnitMemberDto[],
  designations: readonly DesignationSummaryDto[],
  excludedUserId: string,
): Map<string, string> {
  const singleHolderIds = new Set(designations.filter((designation) => designation.single_holder_per_unit).map((designation) => designation.id));
  const holders = new Map<string, string>();
  for (const member of members) {
    if (member.user.id === excludedUserId) continue;
    for (const designation of member.designations) {
      if (singleHolderIds.has(designation.id)) holders.set(designation.id, member.user.full_name);
    }
  }
  return holders;
}

export function toDesignationOptions(
  designations: readonly DesignationSummaryDto[],
  assignedIds: readonly string[],
  holderNames: ReadonlyMap<string, string>,
): ComboboxOption[] {
  return designations.map((designation) => {
    const holder = assignedIds.includes(designation.id) ? undefined : holderNames.get(designation.id);
    return {
      value: designation.id,
      label: designation.title,
      group: DESIGNATION_CATEGORY_LABELS[designation.category],
      description: designation.single_holder_per_unit ? USER_AFFILIATION_COPY.onePerUnit : undefined,
      disabledReason: holder ? USER_AFFILIATION_COPY.heldBy(holder) : undefined,
    };
  });
}
