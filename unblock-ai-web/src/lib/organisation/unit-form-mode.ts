import type { OrganisationalUnitSummaryDto, OrganisationalUnitType } from "@/types/organisational-unit";

export enum UnitFormKind {
  CREATE = "create",
  EDIT = "edit",
}

export type UnitFormMode =
  | { kind: UnitFormKind.CREATE; unitType: OrganisationalUnitType; parentId: string | null }
  | { kind: UnitFormKind.EDIT; unit: OrganisationalUnitSummaryDto };
