"use client";
import { useMemo, useReducer, useState, type ReactNode } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { Combobox } from "@/components/ui/Combobox";
import { Icon } from "@/components/ui/icons/Icon";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { LeavePageDialog } from "@/components/ui/LeavePageDialog";
import { UnsavedChangesBar } from "@/components/ui/UnsavedChangesBar";
import { AffiliationMembershipCard } from "./AffiliationMembershipCard";
import { CURRENT_USER_AFFILIATIONS_PATH, userAffiliationsApi } from "@/lib/api/user-affiliations";
import { ORGANISATIONAL_UNITS_PATH } from "@/lib/api/organisational-units";
import { USERS_PATH } from "@/lib/api/users";
import { revalidateApiPaths } from "@/lib/api/swr-cache";
import { useDesignations, useOrganisationalUnits } from "@/lib/hooks/useOrganisationData";
import { useUnsavedChangesGuard } from "@/lib/hooks/useUnsavedChangesGuard";
import { toGroupedUnitOptions } from "@/lib/organisation/organisational-unit-options";
import {
  AffiliationDraftActionType,
  affiliationDraftReducer,
  createAffiliationDraft,
  isAffiliationDraftDirty,
  toReplaceAffiliationsRequest,
} from "@/lib/user-affiliation/affiliation-draft";
import { mapAffiliationErrors, type AffiliationErrorMap } from "@/lib/user-affiliation/affiliation-error-map";
import { groupByEffectiveFaculty } from "@/lib/user-affiliation/affiliation-grouping";
import { departmentNamesByRequiredFaculty, requiredFacultyIdOf } from "@/lib/user-affiliation/faculty-membership";
import { USER_AFFILIATION_COPY } from "@/lib/user-affiliation/user-affiliation-copy";
import { IconName } from "@/types/icon";
import type { OrganisationalUnitDto } from "@/types/organisational-unit";
import type { UserAffiliationsDto } from "@/types/user-affiliation";

const COPY = USER_AFFILIATION_COPY;
const NO_ERRORS: AffiliationErrorMap = { byUnit: {}, general: [] };

export interface AffiliationEditorControls {
  isDirty: boolean;
  busy: boolean;
  save: () => Promise<boolean>;
}

interface UserAffiliationEditorProps {
  userId: string;
  affiliations: UserAffiliationsDto;
  onSaved?: (affiliations: UserAffiliationsDto) => void;
  renderActions?: (controls: AffiliationEditorControls) => ReactNode;
}

export function UserAffiliationEditor({ userId, affiliations, onSaved, renderActions }: UserAffiliationEditorProps) {
  const toast = useToast();
  const { data: unitData } = useOrganisationalUnits({ include_archived: true });
  const { data: designationData } = useDesignations(true);
  const [draft, dispatch] = useReducer(affiliationDraftReducer, affiliations, createAffiliationDraft);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<AffiliationErrorMap>(NO_ERRORS);
  const isDirty = isAffiliationDraftDirty(draft);
  const guard = useUnsavedChangesGuard(isDirty);

  const designations = useMemo(() => designationData?.designations ?? [], [designationData]);
  const unitsById = useMemo(() => {
    const map = new Map<string, OrganisationalUnitDto>();
    for (const membership of affiliations.memberships) map.set(membership.organisational_unit.id, membership.organisational_unit);
    for (const unit of unitData?.organisational_units ?? []) map.set(unit.id, unit);
    return map;
  }, [affiliations, unitData]);

  const memberships = draft.memberships.flatMap((membership) => {
    const unit = unitsById.get(membership.organisationalUnitId);
    return unit ? [{ membership, unit }] : [];
  });
  const groups = groupByEffectiveFaculty(memberships, (item) => item.unit);
  const departmentNamesByFacultyId = departmentNamesByRequiredFaculty(memberships.map(({ unit }) => unit));
  const takenUnitIds = new Set(draft.memberships.map((membership) => membership.organisationalUnitId));
  const pickerOptions = toGroupedUnitOptions(
    (unitData?.organisational_units ?? []).filter((unit) => !unit.is_archived && !takenUnitIds.has(unit.id)),
  );

  function designationTitle(designationId: string): string {
    return designations.find((designation) => designation.id === designationId)?.title ?? designationId;
  }

  async function save(): Promise<boolean> {
    setBusy(true);
    setErrors(NO_ERRORS);
    try {
      const { affiliations: saved } = await userAffiliationsApi.replace(userId, toReplaceAffiliationsRequest(draft));
      dispatch({ type: AffiliationDraftActionType.LOAD, affiliations: saved });
      await revalidateApiPaths(USERS_PATH, ORGANISATIONAL_UNITS_PATH, CURRENT_USER_AFFILIATIONS_PATH);
      toast.success(COPY.saved);
      onSaved?.(saved);
      return true;
    } catch (err) {
      setErrors(mapAffiliationErrors(err, { designationTitle }, COPY.saveFailed));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function discard(): void {
    setErrors(NO_ERRORS);
    dispatch({ type: AffiliationDraftActionType.DISCARD });
  }

  return (
    <div className="flex flex-col gap-4">
      <Combobox
        ariaLabel={COPY.addUnitLabel}
        placeholder={COPY.addUnitPlaceholder}
        options={pickerOptions}
        loading={!unitData}
        disabled={busy}
        emptyMessage={COPY.noUnitsLeft}
        onSelect={(unitId) => {
          const unit = unitsById.get(unitId);
          dispatch({
            type: AffiliationDraftActionType.ADD_MEMBERSHIP,
            organisationalUnitId: unitId,
            requiredFacultyId: unit ? requiredFacultyIdOf(unit) : null,
          });
        }}
      />

      {errors.general.map((message) => (
        <InlineAlert key={message}>{message}</InlineAlert>
      ))}

      {groups.length === 0 ? (
        <div className="flex flex-col items-center rounded-card border border-dashed border-line-admin px-6 py-10 text-center">
          <Icon name={IconName.ORGANISATION} className="mb-3 h-7 w-7 text-faint" />
          <p className="text-[14px] font-semibold text-ink">{COPY.emptyTitle}</p>
          <p className="mt-1 max-w-[52ch] text-[12.5px] leading-relaxed text-muted">{COPY.emptyBody}</p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.faculty?.id ?? COPY.universityLevel} aria-label={group.faculty?.name ?? COPY.universityLevel}>
            <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-faint">
              {group.faculty?.name ?? COPY.universityLevel}
            </h3>
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {group.items.map(({ membership, unit }) => {
                const dependentDepartments = departmentNamesByFacultyId.get(unit.id);
                return (
                  <AffiliationMembershipCard
                    key={unit.id}
                    userId={userId}
                    unit={unit}
                    designationIds={membership.designationIds}
                    designations={designations}
                    errors={errors.byUnit[unit.id] ?? []}
                    disabled={busy}
                    removalBlockedReason={dependentDepartments ? COPY.facultyRequiredBy(dependentDepartments) : null}
                    onToggleDesignation={(designationId) =>
                      dispatch({ type: AffiliationDraftActionType.TOGGLE_DESIGNATION, organisationalUnitId: unit.id, designationId })
                    }
                    onRemove={() => dispatch({ type: AffiliationDraftActionType.REMOVE_MEMBERSHIP, organisationalUnitId: unit.id })}
                  />
                );
              })}
            </ul>
          </section>
        ))
      )}

      {renderActions
        ? renderActions({ isDirty, busy, save })
        : isDirty && <UnsavedChangesBar busy={busy} onDiscard={discard} onSave={() => void save()} />}
      <LeavePageDialog guard={guard} />
    </div>
  );
}
