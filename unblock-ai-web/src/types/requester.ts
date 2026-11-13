/**
 * TypeScript mirror of the requester DTOs in unblock-ai-api/src/lib/types/{selection/selection-dto,task/task-dto}.type.ts
 * and unblock-ai-api/src/data/constants/requester.constant.ts.
 *
 * WHEN THE SCHEMA CHANGES, CHANGE THIS FILE IN THE SAME COMMIT.
 */
import type { DesignationReferenceDto } from "./designation";
import type { OrganisationalUnitReferenceDto, OrganisationalUnitType } from "./organisational-unit";

export enum RequesterProfileFactKind {
  MEMBER_OF_UNIT = "member_of_unit",
  HOLDS_DESIGNATION = "holds_designation",
}

export interface RequesterProfileFactDto {
  id: string;
  kind: RequesterProfileFactKind;
  unit: OrganisationalUnitReferenceDto;
  parent: OrganisationalUnitReferenceDto | null;
  designation: DesignationReferenceDto | null;
}

export interface RequesterSnapshotUnitDto {
  code: string;
  name: string;
  unit_type: OrganisationalUnitType;
  parent_name: string | null;
  designation_titles: string[];
}

export interface RequesterSnapshotDto {
  full_name: string;
  email: string;
  units: RequesterSnapshotUnitDto[];
}
