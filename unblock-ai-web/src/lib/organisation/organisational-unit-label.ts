import { OrganisationalUnitType } from "@/types/organisational-unit";

export interface UnitTypeLabel {
  singular: string;
  plural: string;
}

export const ORGANISATIONAL_UNIT_TYPE_LABELS: Record<OrganisationalUnitType, UnitTypeLabel> = {
  [OrganisationalUnitType.FACULTY]: { singular: "Faculty", plural: "Faculties" },
  [OrganisationalUnitType.DEPARTMENT]: { singular: "Department", plural: "Departments" },
  [OrganisationalUnitType.DIVISION]: { singular: "Division", plural: "Divisions" },
};
