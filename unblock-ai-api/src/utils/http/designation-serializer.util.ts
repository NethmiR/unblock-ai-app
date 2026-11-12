import type {
  DesignationDto,
  DesignationRecord,
  DesignationReference,
  DesignationReferenceDto,
  DesignationSummaryDto,
  DesignationSummaryRecord,
} from "../../lib/types/designation/designation.type.js";

export function serializeDesignationReference(designation: DesignationReference): DesignationReferenceDto {
  return {
    id: designation.id,
    code: designation.code,
    title: designation.title,
    category: designation.category,
    display_order: designation.displayOrder,
    is_archived: designation.isArchived,
  };
}

export function serializeDesignation(designation: DesignationRecord): DesignationDto {
  return {
    ...serializeDesignationReference(designation),
    applicable_unit_types: [...designation.applicableUnitTypes],
    single_holder_per_unit: designation.singleHolderPerUnit,
    archived_at: designation.archivedAt?.toISOString() ?? null,
    created_at: designation.createdAt.toISOString(),
    updated_at: designation.updatedAt.toISOString(),
  };
}

export function serializeDesignationSummary(designation: DesignationSummaryRecord): DesignationSummaryDto {
  return { ...serializeDesignation(designation), holder_count: designation.holderCount };
}
