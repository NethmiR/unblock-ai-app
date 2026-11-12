"use client";
import { useCallback, useState } from "react";
import { DESIGNATIONS_PATH, designationsApi } from "@/lib/api/designations";
import { USERS_PATH } from "@/lib/api/users";
import { revalidateApiPaths } from "@/lib/api/swr-cache";
import { LifecycleAction, type LifecycleTarget } from "@/lib/organisation/lifecycle-action";
import { describeOrganisationError } from "@/lib/organisation/organisation-error-message";
import { ORGANISATION_COPY } from "@/lib/organisation/organisation-copy";
import { useHighlightedRow } from "./useHighlightedRow";
import { useLifecycleDialog, type LifecycleDialogState } from "./useLifecycleDialog";
import { IconName } from "@/types/icon";
import { MenuItemTone, type MenuItem } from "@/types/menu";
import type { DesignationSummaryDto } from "@/types/designation";

const ACTIONS = ORGANISATION_COPY.designationActions;

export enum DesignationFormState {
  CLOSED = "closed",
  CREATING = "creating",
}

export interface DesignationManagement {
  editing: DesignationSummaryDto | DesignationFormState;
  openCreate: () => void;
  closeForm: () => void;
  handleSaved: (designation: DesignationSummaryDto) => void;
  lifecycle: LifecycleDialogState;
  highlightedId: string | null;
  actionsFor: (designation: DesignationSummaryDto) => MenuItem[];
}

async function performLifecycle(action: LifecycleAction, target: LifecycleTarget): Promise<void> {
  if (action === LifecycleAction.ARCHIVE) await designationsApi.archive(target.id);
  else if (action === LifecycleAction.RESTORE) await designationsApi.restore(target.id);
  else await designationsApi.remove(target.id);
  await revalidateApiPaths(DESIGNATIONS_PATH, USERS_PATH);
}

function toTarget(designation: DesignationSummaryDto): LifecycleTarget {
  return { id: designation.id, code: designation.code, name: designation.title };
}

export function useDesignationManagement(scope: string): DesignationManagement {
  const [editing, setEditing] = useState<DesignationSummaryDto | DesignationFormState>(DesignationFormState.CLOSED);
  const { highlightedId, highlight } = useHighlightedRow(scope);
  const lifecycle = useLifecycleDialog({ perform: performLifecycle, describeError: describeOrganisationError });

  const handleSaved = useCallback(
    (designation: DesignationSummaryDto) => {
      setEditing(DesignationFormState.CLOSED);
      highlight(designation.id);
    },
    [highlight],
  );

  const actionsFor = useCallback(
    (designation: DesignationSummaryDto): MenuItem[] => [
      { label: ACTIONS.edit, icon: IconName.EDIT, onSelect: () => setEditing(designation) },
      designation.is_archived
        ? { label: ACTIONS.restore, icon: IconName.RESTORE, onSelect: () => lifecycle.open(LifecycleAction.RESTORE, toTarget(designation)) }
        : { label: ACTIONS.archive, icon: IconName.ARCHIVE, onSelect: () => lifecycle.open(LifecycleAction.ARCHIVE, toTarget(designation)) },
      {
        label: ACTIONS.delete,
        icon: IconName.TRASH,
        tone: MenuItemTone.DANGER,
        disabledReason: designation.holder_count > 0 ? ACTIONS.deleteBlocked : undefined,
        onSelect: () => lifecycle.open(LifecycleAction.DELETE, toTarget(designation)),
      },
    ],
    [lifecycle],
  );

  return {
    editing,
    openCreate: () => setEditing(DesignationFormState.CREATING),
    closeForm: () => setEditing(DesignationFormState.CLOSED),
    handleSaved,
    lifecycle,
    highlightedId,
    actionsFor,
  };
}
