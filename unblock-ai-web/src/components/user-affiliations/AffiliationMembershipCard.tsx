"use client";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { Icon } from "@/components/ui/icons/Icon";
import { OrganisationalUnitName } from "@/components/organisation/shared/OrganisationalUnitName";
import { useOrganisationalUnitMembers } from "@/lib/hooks/useOrganisationData";
import { ORGANISATIONAL_UNIT_TYPE_LABELS } from "@/lib/organisation/organisational-unit-label";
import { applicableDesignations } from "@/lib/user-affiliation/affiliation-draft";
import { singleHolderNames, toDesignationOptions } from "@/lib/user-affiliation/designation-options";
import { USER_AFFILIATION_COPY } from "@/lib/user-affiliation/user-affiliation-copy";
import { cn } from "@/lib/utils/cn";
import { IconName } from "@/types/icon";
import type { DesignationSummaryDto } from "@/types/designation";
import type { OrganisationalUnitDto } from "@/types/organisational-unit";

const COPY = USER_AFFILIATION_COPY;

interface AffiliationMembershipCardProps {
  userId: string;
  unit: OrganisationalUnitDto;
  designationIds: readonly string[];
  designations: readonly DesignationSummaryDto[];
  errors: readonly string[];
  disabled: boolean;
  removalBlockedReason?: string | null;
  onToggleDesignation: (designationId: string) => void;
  onRemove: () => void;
}

export function AffiliationMembershipCard({
  userId,
  unit,
  designationIds,
  designations,
  errors,
  disabled,
  removalBlockedReason = null,
  onToggleDesignation,
  onRemove,
}: AffiliationMembershipCardProps) {
  const [isConfirmingRemoval, setIsConfirmingRemoval] = useState(false);
  const applicable = useMemo(
    () => applicableDesignations(unit.unit_type, designations, [...designationIds]),
    [designationIds, designations, unit.unit_type],
  );
  const hasSingleHolderOptions = applicable.some((designation) => designation.single_holder_per_unit);
  const { data: members } = useOrganisationalUnitMembers(hasSingleHolderOptions ? unit.id : null);
  const holders = useMemo(() => singleHolderNames(members?.members ?? [], applicable, userId), [applicable, members, userId]);
  const options = useMemo(() => toDesignationOptions(applicable, designationIds, holders), [applicable, designationIds, holders]);
  const selected = designationIds.flatMap((id) => designations.filter((designation) => designation.id === id));

  const requestRemoval = () => (designationIds.length > 0 ? setIsConfirmingRemoval(true) : onRemove());

  return (
    <li
      className={cn(
        "min-w-0 rounded-card border bg-surface p-4 transition-colors",
        errors.length > 0 ? "border-danger/40 bg-danger/5" : "border-line-admin",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <OrganisationalUnitName unit={unit} wrap />
          <p className="mt-0.5 text-[12px] text-muted">
            {ORGANISATIONAL_UNIT_TYPE_LABELS[unit.unit_type].singular}
            {unit.parent ? ` · ${unit.parent.name}` : ""}
          </p>
        </div>
        {!isConfirmingRemoval && (
          <button
            type="button"
            onClick={requestRemoval}
            disabled={disabled || removalBlockedReason !== null}
            title={removalBlockedReason ?? undefined}
            aria-label={COPY.removeMembership(unit.name)}
            className="cursor-pointer rounded-control p-1.5 text-faint transition-colors hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-faint"
          >
            <Icon name={IconName.TRASH} className="h-4 w-4" />
          </button>
        )}
      </div>

      {removalBlockedReason !== null && <p className="mt-2 text-[12px] text-muted">{removalBlockedReason}</p>}

      {isConfirmingRemoval && (
        <div role="alert" className="mt-3 flex flex-col gap-2 rounded-control bg-danger/5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-[12.5px] font-medium text-danger">{COPY.confirmRemoval(designationIds.length)}</span>
          <span className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setIsConfirmingRemoval(false)}>
              {COPY.keep}
            </Button>
            <Button size="sm" variant="danger" onClick={onRemove}>
              {COPY.confirmRemove}
            </Button>
          </span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {selected.length === 0 ? (
          <span className="text-[12.5px] text-muted">{COPY.memberOnly}</span>
        ) : (
          selected.map((designation) => (
            <Badge key={designation.id} tone={designation.is_archived ? "warn" : "accent"} className="gap-1 pr-1">
              {designation.title}
              <button
                type="button"
                onClick={() => onToggleDesignation(designation.id)}
                disabled={disabled}
                aria-label={COPY.removeDesignation(designation.title)}
                className="cursor-pointer rounded-pill p-0.5 hover:bg-accent/15 disabled:cursor-not-allowed"
              >
                <Icon name={IconName.CLOSE} className="h-3 w-3" />
              </button>
            </Badge>
          ))
        )}
      </div>

      <Combobox
        className="mt-3"
        ariaLabel={COPY.designationsLabel(unit.name)}
        placeholder={COPY.addDesignationPlaceholder}
        options={options}
        selectedValues={designationIds}
        onSelect={onToggleDesignation}
        closeOnSelect={false}
        disabled={disabled}
        emptyMessage={COPY.noApplicableDesignations}
      />

      {errors.length > 0 && (
        <ul className="mt-3 space-y-1">
          {errors.map((error) => (
            <li key={error} className="text-[12.5px] text-danger">
              {error}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
