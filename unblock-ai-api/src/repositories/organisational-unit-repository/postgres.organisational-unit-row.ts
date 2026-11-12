import type { OrganisationalUnitType } from "../../data/constants/organisational-unit.constant.js";
import type {
  OrganisationalUnitRecord,
  OrganisationalUnitReference,
  OrganisationalUnitSummaryRecord,
} from "../../lib/types/organisational-unit/organisational-unit.type.js";

export interface OrganisationalUnitRow {
  id: string;
  code: string;
  name: string;
  unit_type: OrganisationalUnitType;
  description: string | null;
  archived_at: Date | null;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
  parent_id: string | null;
  parent_code: string | null;
  parent_name: string | null;
  parent_unit_type: OrganisationalUnitType | null;
  parent_archived_at: Date | null;
}

export interface OrganisationalUnitSummaryRow extends OrganisationalUnitRow {
  member_count: number;
  child_count: number;
  active_child_count: number;
}

export const ORGANISATIONAL_UNIT_COLUMNS = `
  ou.id, ou.code, ou.name, ou.unit_type, ou.description, ou.archived_at,
  ou.created_by_user_id, ou.created_at, ou.updated_at,
  pou.id AS parent_id, pou.code AS parent_code, pou.name AS parent_name,
  pou.unit_type AS parent_unit_type, pou.archived_at AS parent_archived_at`;

export const ORGANISATIONAL_UNIT_USAGE_COLUMNS = `
  (SELECT count(*)::int FROM user_organisational_units uou WHERE uou.organisational_unit_id = ou.id) AS member_count,
  (SELECT count(*)::int FROM organisational_units cou WHERE cou.parent_id = ou.id) AS child_count,
  (SELECT count(*)::int FROM organisational_units cou WHERE cou.parent_id = ou.id AND cou.archived_at IS NULL) AS active_child_count`;

export const ORGANISATIONAL_UNIT_SOURCE = `
  organisational_units ou
  LEFT JOIN organisational_units pou ON pou.id = ou.parent_id`;

function toParentReference(row: OrganisationalUnitRow): OrganisationalUnitReference | null {
  if (row.parent_id === null || row.parent_code === null || row.parent_name === null || row.parent_unit_type === null) {
    return null;
  }
  return {
    id: row.parent_id,
    code: row.parent_code,
    name: row.parent_name,
    unitType: row.parent_unit_type,
    isArchived: row.parent_archived_at !== null,
  };
}

export function toOrganisationalUnitRecord(row: OrganisationalUnitRow): OrganisationalUnitRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    unitType: row.unit_type,
    isArchived: row.archived_at !== null,
    parent: toParentReference(row),
    description: row.description,
    archivedAt: row.archived_at,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toOrganisationalUnitSummaryRecord(row: OrganisationalUnitSummaryRow): OrganisationalUnitSummaryRecord {
  return {
    ...toOrganisationalUnitRecord(row),
    memberCount: row.member_count,
    childCount: row.child_count,
    activeChildCount: row.active_child_count,
  };
}
