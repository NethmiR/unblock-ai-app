import type { DesignationReferenceDto } from "./designation";
import type { UserReferenceDto } from "./user";

export enum OrganisationalUnitType {
  FACULTY = "faculty",
  DEPARTMENT = "department",
  DIVISION = "division",
}

export const ORGANISATIONAL_UNIT_TYPES: readonly OrganisationalUnitType[] = Object.values(OrganisationalUnitType);

export enum ParentRequirement {
  FORBIDDEN = "forbidden",
  REQUIRED = "required",
  OPTIONAL = "optional",
}

export enum OrganisationalUnitErrorCode {
  ORGANISATIONAL_UNIT_NOT_FOUND = "ORGANISATIONAL_UNIT_NOT_FOUND",
  ORGANISATIONAL_UNIT_CODE_TAKEN = "ORGANISATIONAL_UNIT_CODE_TAKEN",
  ORGANISATIONAL_UNIT_NAME_TAKEN = "ORGANISATIONAL_UNIT_NAME_TAKEN",
  ORGANISATIONAL_UNIT_PARENT_INVALID = "ORGANISATIONAL_UNIT_PARENT_INVALID",
  ORGANISATIONAL_UNIT_PARENT_ARCHIVED = "ORGANISATIONAL_UNIT_PARENT_ARCHIVED",
  ORGANISATIONAL_UNIT_HAS_ACTIVE_CHILDREN = "ORGANISATIONAL_UNIT_HAS_ACTIVE_CHILDREN",
  ORGANISATIONAL_UNIT_IN_USE = "ORGANISATIONAL_UNIT_IN_USE",
  ORGANISATIONAL_UNIT_HAS_MEMBERS = "ORGANISATIONAL_UNIT_HAS_MEMBERS",
}

export interface OrganisationalUnitReferenceDto {
  id: string;
  code: string;
  name: string;
  unit_type: OrganisationalUnitType;
  is_archived: boolean;
}

export interface OrganisationalUnitDto extends OrganisationalUnitReferenceDto {
  parent: OrganisationalUnitReferenceDto | null;
  description: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganisationalUnitSummaryDto extends OrganisationalUnitDto {
  member_count: number;
  child_count: number;
  active_child_count: number;
}

export interface OrganisationalUnitMemberDto {
  user: UserReferenceDto;
  designations: DesignationReferenceDto[];
  assigned_at: string;
}

export interface OrganisationalUnitListQuery {
  unit_type?: OrganisationalUnitType;
  parent_id?: string;
  root_only?: boolean;
  include_archived?: boolean;
}

export interface OrganisationalUnitListResponse {
  organisational_units: OrganisationalUnitSummaryDto[];
}

export interface OrganisationalUnitResponse {
  organisational_unit: OrganisationalUnitSummaryDto;
}

export interface OrganisationalUnitMemberListResponse {
  members: OrganisationalUnitMemberDto[];
}

export interface CreateOrganisationalUnitRequest {
  code: string;
  name: string;
  unit_type: OrganisationalUnitType;
  parent_id: string | null;
  description: string | null;
}

export interface UpdateOrganisationalUnitRequest {
  name?: string;
  parent_id?: string | null;
  description?: string | null;
}
