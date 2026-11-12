import type {
  CreateDesignationRecordInput,
  DesignationHolderCountByUnitType,
  DesignationRecord,
  DesignationSummaryRecord,
  UpdateDesignationInput,
} from "../../lib/types/designation/designation.type.js";

export interface IDesignationRepository {
  list(includeArchived: boolean): Promise<DesignationSummaryRecord[]>;
  findById(id: string): Promise<DesignationSummaryRecord | null>;
  findByIds(ids: readonly string[]): Promise<DesignationRecord[]>;
  findByCode(code: string): Promise<DesignationRecord | null>;
  countHoldersByUnitType(id: string): Promise<DesignationHolderCountByUnitType>;
  findUnitsWithMultipleHolders(id: string): Promise<string[]>;
  create(input: CreateDesignationRecordInput): Promise<DesignationSummaryRecord>;
  update(id: string, input: UpdateDesignationInput): Promise<DesignationSummaryRecord>;
  setArchivedAt(id: string, archivedAt: Date | null): Promise<DesignationSummaryRecord>;
  delete(id: string): Promise<void>;
}
