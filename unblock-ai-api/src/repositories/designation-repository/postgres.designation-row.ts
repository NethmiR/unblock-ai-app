import { sortOrganisationalUnitTypes } from "../../utils/organisation/organisational-unit-type.util.js";
import type { DesignationCategory } from "../../data/constants/designation.constant.js";
import type { OrganisationalUnitType } from "../../data/constants/organisational-unit.constant.js";
import type {
  DesignationRecord,
  DesignationReference,
  DesignationSummaryRecord,
} from "../../lib/types/designation/designation.type.js";

export interface DesignationRow {
  id: string;
  code: string;
  title: string;
  category: DesignationCategory;
  single_holder_per_unit: boolean;
  display_order: number;
  archived_at: Date | null;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
  applicable_unit_types: OrganisationalUnitType[];
}

export interface DesignationSummaryRow extends DesignationRow {
  holder_count: number;
}

export interface DesignationReferenceRow {
  designation_id: string;
  designation_code: string;
  designation_title: string;
  designation_category: DesignationCategory;
  designation_display_order: number;
  designation_archived_at: Date | null;
}

export const DESIGNATION_COLUMNS = `
  d.id, d.code, d.title, d.category, d.single_holder_per_unit, d.display_order, d.archived_at,
  d.created_by_user_id, d.created_at, d.updated_at,
  COALESCE(
    (SELECT array_agg(dut.unit_type) FROM designation_unit_types dut WHERE dut.designation_id = d.id),
    '{}'
  ) AS applicable_unit_types`;

export const DESIGNATION_HOLDER_COUNT_COLUMN = `
  (SELECT count(*)::int FROM user_designations ud WHERE ud.designation_id = d.id) AS holder_count`;

export const DESIGNATION_REFERENCE_COLUMNS = `
  d.id AS designation_id, d.code AS designation_code, d.title AS designation_title,
  d.category AS designation_category, d.display_order AS designation_display_order,
  d.archived_at AS designation_archived_at`;

export function toDesignationRecord(row: DesignationRow): DesignationRecord {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    category: row.category,
    displayOrder: row.display_order,
    isArchived: row.archived_at !== null,
    applicableUnitTypes: sortOrganisationalUnitTypes(row.applicable_unit_types),
    singleHolderPerUnit: row.single_holder_per_unit,
    archivedAt: row.archived_at,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toDesignationSummaryRecord(row: DesignationSummaryRow): DesignationSummaryRecord {
  return { ...toDesignationRecord(row), holderCount: row.holder_count };
}

export function toDesignationReferenceFromRow(row: DesignationReferenceRow): DesignationReference {
  return {
    id: row.designation_id,
    code: row.designation_code,
    title: row.designation_title,
    category: row.designation_category,
    displayOrder: row.designation_display_order,
    isArchived: row.designation_archived_at !== null,
  };
}
