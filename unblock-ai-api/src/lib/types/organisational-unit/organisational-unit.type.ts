import type { OrganisationalUnitType } from "../../../data/constants/organisational-unit.constant.js";
import type { DesignationReference, DesignationReferenceDto } from "../designation/designation.type.js";
import type { UserReference, UserReferenceDto } from "../user/user.type.js";

export interface OrganisationalUnitReference {
  id: string;
  code: string;
  name: string;
  unitType: OrganisationalUnitType;
  isArchived: boolean;
}

export interface OrganisationalUnitRecord extends OrganisationalUnitReference {
  parent: OrganisationalUnitReference | null;
  description: string | null;
  archivedAt: Date | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganisationalUnitUsage {
  memberCount: number;
  childCount: number;
  activeChildCount: number;
}

export interface OrganisationalUnitSummaryRecord extends OrganisationalUnitRecord, OrganisationalUnitUsage {}

export interface OrganisationalUnitListFilter {
  unitType: OrganisationalUnitType | null;
  parentId: string | null;
  rootOnly: boolean;
  includeArchived: boolean;
}

export interface OrganisationalUnitParentKey {
  id: string;
  unitType: OrganisationalUnitType;
}

export interface CreateOrganisationalUnitInput {
  code: string;
  name: string;
  unitType: OrganisationalUnitType;
  parentId: string | null;
  description: string | null;
}

export interface CreateOrganisationalUnitRecordInput {
  code: string;
  name: string;
  unitType: OrganisationalUnitType;
  parent: OrganisationalUnitParentKey | null;
  description: string | null;
  createdByUserId: string | null;
}

export interface UpdateOrganisationalUnitInput {
  name?: string;
  parentId?: string | null;
  description?: string | null;
}

export interface UpdateOrganisationalUnitRecordInput {
  name?: string;
  parent?: OrganisationalUnitParentKey | null;
  description?: string | null;
}

export interface OrganisationalUnitMemberRecord {
  user: UserReference;
  designations: DesignationReference[];
  assignedAt: Date;
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
