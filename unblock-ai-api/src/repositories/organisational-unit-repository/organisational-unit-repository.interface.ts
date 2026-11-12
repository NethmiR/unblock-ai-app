import type {
  CreateOrganisationalUnitRecordInput,
  OrganisationalUnitListFilter,
  OrganisationalUnitRecord,
  OrganisationalUnitSummaryRecord,
  UpdateOrganisationalUnitRecordInput,
} from "../../lib/types/organisational-unit/organisational-unit.type.js";

export interface IOrganisationalUnitRepository {
  list(filter: OrganisationalUnitListFilter): Promise<OrganisationalUnitSummaryRecord[]>;
  findById(id: string): Promise<OrganisationalUnitSummaryRecord | null>;
  findByIds(ids: readonly string[]): Promise<OrganisationalUnitRecord[]>;
  findByCode(code: string): Promise<OrganisationalUnitRecord | null>;
  create(input: CreateOrganisationalUnitRecordInput): Promise<OrganisationalUnitSummaryRecord>;
  update(id: string, input: UpdateOrganisationalUnitRecordInput): Promise<OrganisationalUnitSummaryRecord>;
  setArchivedAt(id: string, archivedAt: Date | null): Promise<OrganisationalUnitSummaryRecord>;
  delete(id: string): Promise<void>;
}
