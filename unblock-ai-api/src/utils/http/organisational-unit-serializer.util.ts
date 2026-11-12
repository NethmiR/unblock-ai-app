import { serializeDesignationReference } from "./designation-serializer.util.js";
import { serializeUserReference } from "./user-serializer.util.js";
import type {
  OrganisationalUnitDto,
  OrganisationalUnitMemberDto,
  OrganisationalUnitMemberRecord,
  OrganisationalUnitRecord,
  OrganisationalUnitReference,
  OrganisationalUnitReferenceDto,
  OrganisationalUnitSummaryDto,
  OrganisationalUnitSummaryRecord,
} from "../../lib/types/organisational-unit/organisational-unit.type.js";

export function serializeOrganisationalUnitReference(unit: OrganisationalUnitReference): OrganisationalUnitReferenceDto {
  return { id: unit.id, code: unit.code, name: unit.name, unit_type: unit.unitType, is_archived: unit.isArchived };
}

export function serializeOrganisationalUnit(unit: OrganisationalUnitRecord): OrganisationalUnitDto {
  return {
    ...serializeOrganisationalUnitReference(unit),
    parent: unit.parent ? serializeOrganisationalUnitReference(unit.parent) : null,
    description: unit.description,
    archived_at: unit.archivedAt?.toISOString() ?? null,
    created_at: unit.createdAt.toISOString(),
    updated_at: unit.updatedAt.toISOString(),
  };
}

export function serializeOrganisationalUnitSummary(unit: OrganisationalUnitSummaryRecord): OrganisationalUnitSummaryDto {
  return {
    ...serializeOrganisationalUnit(unit),
    member_count: unit.memberCount,
    child_count: unit.childCount,
    active_child_count: unit.activeChildCount,
  };
}

export function serializeOrganisationalUnitMember(member: OrganisationalUnitMemberRecord): OrganisationalUnitMemberDto {
  return {
    user: serializeUserReference(member.user),
    designations: member.designations.map(serializeDesignationReference),
    assigned_at: member.assignedAt.toISOString(),
  };
}
