"use client";
import { LifecycleDialog } from "./LifecycleDialog";
import { OrganisationalUnitFormDrawer } from "./OrganisationalUnitFormDrawer";
import { OrganisationalUnitMembersDrawer } from "./OrganisationalUnitMembersDrawer";
import type { OrganisationalUnitManagement } from "@/lib/hooks/useOrganisationalUnitManagement";
import type { OrganisationalUnitSummaryDto } from "@/types/organisational-unit";

interface OrganisationalUnitDialogsProps {
  management: OrganisationalUnitManagement;
  units: readonly OrganisationalUnitSummaryDto[];
}

export function OrganisationalUnitDialogs({ management, units }: OrganisationalUnitDialogsProps) {
  return (
    <>
      {management.formMode && (
        <OrganisationalUnitFormDrawer
          mode={management.formMode}
          units={units}
          onClose={management.closeForm}
          onSaved={management.handleSaved}
        />
      )}
      {management.membersUnit && <OrganisationalUnitMembersDrawer unit={management.membersUnit} onClose={management.closeMembers} />}
      <LifecycleDialog state={management.lifecycle} />
    </>
  );
}
