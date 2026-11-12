import type { DesignationCategory } from "../../../data/constants/designation.constant.js";
import type { OrganisationalUnitType } from "../../../data/constants/organisational-unit.constant.js";

export interface DesignationReference {
  id: string;
  code: string;
  title: string;
  category: DesignationCategory;
  displayOrder: number;
  isArchived: boolean;
}

export interface DesignationRecord extends DesignationReference {
  applicableUnitTypes: OrganisationalUnitType[];
  singleHolderPerUnit: boolean;
  archivedAt: Date | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DesignationSummaryRecord extends DesignationRecord {
  holderCount: number;
}

export interface CreateDesignationInput {
  code: string;
  title: string;
  category: DesignationCategory;
  applicableUnitTypes: OrganisationalUnitType[];
  singleHolderPerUnit: boolean;
  displayOrder: number;
}

export interface CreateDesignationRecordInput extends CreateDesignationInput {
  createdByUserId: string | null;
}

export type UpdateDesignationInput = Partial<Omit<CreateDesignationInput, "code">>;

export type DesignationHolderCountByUnitType = Record<OrganisationalUnitType, number>;

export interface DesignationReferenceDto {
  id: string;
  code: string;
  title: string;
  category: DesignationCategory;
  display_order: number;
  is_archived: boolean;
}

export interface DesignationDto extends DesignationReferenceDto {
  applicable_unit_types: OrganisationalUnitType[];
  single_holder_per_unit: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DesignationSummaryDto extends DesignationDto {
  holder_count: number;
}
