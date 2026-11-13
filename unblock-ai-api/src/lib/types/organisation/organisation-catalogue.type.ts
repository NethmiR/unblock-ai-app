import type { DesignationRecord } from "../designation/designation.type.js";
import type { OrganisationalUnitRecord } from "../organisational-unit/organisational-unit.type.js";

export interface OrganisationCatalogue {
  units: OrganisationalUnitRecord[];
  designations: DesignationRecord[];
  unitsByCode: ReadonlyMap<string, OrganisationalUnitRecord>;
  designationsByCode: ReadonlyMap<string, DesignationRecord>;
}
