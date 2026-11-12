"use client";
import { useCallback, useState } from "react";
import { ORGANISATIONAL_UNITS_PATH, organisationalUnitsApi } from "@/lib/api/organisational-units";
import { USERS_PATH } from "@/lib/api/users";
import { revalidateApiPaths } from "@/lib/api/swr-cache";
import { LifecycleAction, type LifecycleTarget } from "@/lib/organisation/lifecycle-action";
import { describeOrganisationError } from "@/lib/organisation/organisation-error-message";
import { ORGANISATION_COPY } from "@/lib/organisation/organisation-copy";
import { UnitFormKind, type UnitFormMode } from "@/lib/organisation/unit-form-mode";
import { useHighlightedRow } from "./useHighlightedRow";
import { useLifecycleDialog, type LifecycleDialogState } from "./useLifecycleDialog";
import { IconName } from "@/types/icon";
import { MenuItemTone, type MenuItem } from "@/types/menu";
import type { OrganisationalUnitSummaryDto } from "@/types/organisational-unit";

const ACTIONS = ORGANISATION_COPY.unitActions;

export interface OrganisationalUnitManagement {
  formMode: UnitFormMode | null;
  openForm: (mode: UnitFormMode) => void;
  closeForm: () => void;
  handleSaved: (unit: OrganisationalUnitSummaryDto) => void;
  membersUnit: OrganisationalUnitSummaryDto | null;
  closeMembers: () => void;
  lifecycle: LifecycleDialogState;
  highlightedId: string | null;
  actionsFor: (unit: OrganisationalUnitSummaryDto, leadingItems?: readonly MenuItem[]) => MenuItem[];
}

async function performLifecycle(action: LifecycleAction, target: LifecycleTarget): Promise<void> {
  if (action === LifecycleAction.ARCHIVE) await organisationalUnitsApi.archive(target.id);
  else if (action === LifecycleAction.RESTORE) await organisationalUnitsApi.restore(target.id);
  else await organisationalUnitsApi.remove(target.id);
  await revalidateApiPaths(ORGANISATIONAL_UNITS_PATH, USERS_PATH);
}

function toTarget(unit: OrganisationalUnitSummaryDto): LifecycleTarget {
  return { id: unit.id, code: unit.code, name: unit.name };
}

export function useOrganisationalUnitManagement(scope: string): OrganisationalUnitManagement {
  const [formMode, setFormMode] = useState<UnitFormMode | null>(null);
  const [membersUnit, setMembersUnit] = useState<OrganisationalUnitSummaryDto | null>(null);
  const { highlightedId, highlight } = useHighlightedRow(scope);
  const lifecycle = useLifecycleDialog({ perform: performLifecycle, describeError: describeOrganisationError });

  const handleSaved = useCallback(
    (unit: OrganisationalUnitSummaryDto) => {
      setFormMode(null);
      highlight(unit.id);
    },
    [highlight],
  );

  const actionsFor = useCallback(
    (unit: OrganisationalUnitSummaryDto, leadingItems: readonly MenuItem[] = []): MenuItem[] => {
      const lifecycleItem: MenuItem = unit.is_archived
        ? {
            label: ACTIONS.restore,
            icon: IconName.RESTORE,
            disabledReason: unit.parent?.is_archived ? ACTIONS.restoreBlocked : undefined,
            onSelect: () => lifecycle.open(LifecycleAction.RESTORE, toTarget(unit)),
          }
        : {
            label: ACTIONS.archive,
            icon: IconName.ARCHIVE,
            disabledReason: unit.active_child_count > 0 ? ACTIONS.archiveBlocked(unit.active_child_count) : undefined,
            onSelect: () => lifecycle.open(LifecycleAction.ARCHIVE, toTarget(unit)),
          };

      return [
        ...leadingItems,
        { label: ACTIONS.edit, icon: IconName.EDIT, onSelect: () => setFormMode({ kind: UnitFormKind.EDIT, unit }) },
        { label: ACTIONS.viewMembers, icon: IconName.MEMBERS, onSelect: () => setMembersUnit(unit) },
        lifecycleItem,
        {
          label: ACTIONS.delete,
          icon: IconName.TRASH,
          tone: MenuItemTone.DANGER,
          disabledReason: unit.member_count > 0 || unit.child_count > 0 ? ACTIONS.deleteBlocked : undefined,
          onSelect: () => lifecycle.open(LifecycleAction.DELETE, toTarget(unit)),
        },
      ];
    },
    [lifecycle],
  );

  return {
    formMode,
    openForm: setFormMode,
    closeForm: () => setFormMode(null),
    handleSaved,
    membersUnit,
    closeMembers: () => setMembersUnit(null),
    lifecycle,
    highlightedId,
    actionsFor,
  };
}
