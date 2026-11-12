import type { OrganisationalUnitType } from "./organisational-unit";

export enum DesignationCategory {
  LEADERSHIP = "leadership",
  ACADEMIC = "academic",
  ACADEMIC_SUPPORT = "academic_support",
  ADMINISTRATIVE = "administrative",
  NON_ACADEMIC = "non_academic",
  STUDENT = "student",
}

export const DESIGNATION_CATEGORIES: readonly DesignationCategory[] = Object.values(DesignationCategory);

export enum DesignationErrorCode {
  DESIGNATION_NOT_FOUND = "DESIGNATION_NOT_FOUND",
  DESIGNATION_CODE_TAKEN = "DESIGNATION_CODE_TAKEN",
  DESIGNATION_TITLE_TAKEN = "DESIGNATION_TITLE_TAKEN",
  DESIGNATION_UNIT_TYPE_IN_USE = "DESIGNATION_UNIT_TYPE_IN_USE",
  DESIGNATION_SINGLE_HOLDER_VIOLATED = "DESIGNATION_SINGLE_HOLDER_VIOLATED",
  DESIGNATION_IN_USE = "DESIGNATION_IN_USE",
}

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

export interface DesignationListResponse {
  designations: DesignationSummaryDto[];
}

export interface DesignationResponse {
  designation: DesignationSummaryDto;
}

export interface CreateDesignationRequest {
  code: string;
  title: string;
  category: DesignationCategory;
  applicable_unit_types: OrganisationalUnitType[];
  single_holder_per_unit: boolean;
  display_order: number;
}

export type UpdateDesignationRequest = Partial<Omit<CreateDesignationRequest, "code">>;
