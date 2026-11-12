import type { DesignationCategory } from "../data/constants/designation.constant.js";
import type { OrganisationalUnitType } from "../data/constants/organisational-unit.constant.js";
import { sortOrganisationalUnitTypes } from "../utils/organisation/organisational-unit-type.util.js";
import type {
  OrganisationalUnitRecord,
  OrganisationalUnitReference,
  OrganisationalUnitSummaryRecord,
} from "../lib/types/organisational-unit/organisational-unit.type.js";
import type {
  DesignationRecord,
  DesignationReference,
  DesignationSummaryRecord,
} from "../lib/types/designation/designation.type.js";

export interface StoredOrganisationalUnit {
  id: string;
  code: string;
  name: string;
  unitType: OrganisationalUnitType;
  parentId: string | null;
  description: string | null;
  archivedAt: Date | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredDesignation {
  id: string;
  code: string;
  title: string;
  category: DesignationCategory;
  applicableUnitTypes: OrganisationalUnitType[];
  singleHolderPerUnit: boolean;
  displayOrder: number;
  archivedAt: Date | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredMembership {
  userId: string;
  organisationalUnitId: string;
  assignedByUserId: string | null;
  assignedAt: Date;
}

export interface StoredDesignationAssignment {
  userId: string;
  designationId: string;
  organisationalUnitId: string;
  assignedByUserId: string | null;
  assignedAt: Date;
}

export class InMemoryOrganisationStore {
  readonly units = new Map<string, StoredOrganisationalUnit>();
  readonly designations = new Map<string, StoredDesignation>();
  memberships: StoredMembership[] = [];
  assignments: StoredDesignationAssignment[] = [];

  childrenOf(unitId: string): StoredOrganisationalUnit[] {
    return [...this.units.values()].filter((unit) => unit.parentId === unitId);
  }

  membershipsOfUnit(unitId: string): StoredMembership[] {
    return this.memberships.filter((membership) => membership.organisationalUnitId === unitId);
  }

  membershipsOfUser(userId: string): StoredMembership[] {
    return this.memberships.filter((membership) => membership.userId === userId);
  }

  assignmentsOfDesignation(designationId: string): StoredDesignationAssignment[] {
    return this.assignments.filter((assignment) => assignment.designationId === designationId);
  }

  isMemberOfUnitOrItsChildren(userId: string, unitId: string): boolean {
    return this.membershipsOfUser(userId).some(
      (membership) =>
        membership.organisationalUnitId === unitId || this.units.get(membership.organisationalUnitId)?.parentId === unitId,
    );
  }

  toUnitReference(unit: StoredOrganisationalUnit): OrganisationalUnitReference {
    return { id: unit.id, code: unit.code, name: unit.name, unitType: unit.unitType, isArchived: unit.archivedAt !== null };
  }

  toUnitRecord(unit: StoredOrganisationalUnit): OrganisationalUnitRecord {
    const parent = unit.parentId === null ? undefined : this.units.get(unit.parentId);
    return {
      ...this.toUnitReference(unit),
      parent: parent ? this.toUnitReference(parent) : null,
      description: unit.description,
      archivedAt: unit.archivedAt,
      createdByUserId: unit.createdByUserId,
      createdAt: unit.createdAt,
      updatedAt: unit.updatedAt,
    };
  }

  toUnitSummary(unit: StoredOrganisationalUnit): OrganisationalUnitSummaryRecord {
    const children = this.childrenOf(unit.id);
    return {
      ...this.toUnitRecord(unit),
      memberCount: this.membershipsOfUnit(unit.id).length,
      childCount: children.length,
      activeChildCount: children.filter((child) => child.archivedAt === null).length,
    };
  }

  toDesignationReference(designation: StoredDesignation): DesignationReference {
    return {
      id: designation.id,
      code: designation.code,
      title: designation.title,
      category: designation.category,
      displayOrder: designation.displayOrder,
      isArchived: designation.archivedAt !== null,
    };
  }

  toDesignationRecord(designation: StoredDesignation): DesignationRecord {
    return {
      ...this.toDesignationReference(designation),
      applicableUnitTypes: sortOrganisationalUnitTypes(designation.applicableUnitTypes),
      singleHolderPerUnit: designation.singleHolderPerUnit,
      archivedAt: designation.archivedAt,
      createdByUserId: designation.createdByUserId,
      createdAt: designation.createdAt,
      updatedAt: designation.updatedAt,
    };
  }

  toDesignationSummary(designation: StoredDesignation): DesignationSummaryRecord {
    return {
      ...this.toDesignationRecord(designation),
      holderCount: this.assignmentsOfDesignation(designation.id).length,
    };
  }
}
