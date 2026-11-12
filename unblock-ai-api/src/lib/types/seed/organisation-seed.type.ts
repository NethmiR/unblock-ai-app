import type { DesignationCategory } from "../../../data/constants/designation.constant.js";
import type { OrganisationalUnitType } from "../../../data/constants/organisational-unit.constant.js";

export interface OrganisationalUnitSeed {
  code: string;
  name: string;
  unitType: OrganisationalUnitType;
  children?: readonly OrganisationalUnitSeed[];
}

export interface FlattenedOrganisationalUnitSeed {
  seed: OrganisationalUnitSeed;
  parentCode: string | null;
}

export interface DesignationSeed {
  code: string;
  title: string;
  category: DesignationCategory;
  applicableUnitTypes: readonly OrganisationalUnitType[];
  singleHolderPerUnit: boolean;
  displayOrder: number;
}
